import { ServiceBillKind, ServiceBillStatus } from "@paymentgate/domain";
import { findOrgById } from "../orgs/org-store.mjs";
import { loadOrgSetupStatus } from "../auth/org-setup.mjs";
import {
  listMembershipsForOrg,
  listMembershipsForUser,
} from "../orgs/membership-store.mjs";
import { findUserById } from "../auth/users.mjs";
import { getBillingCalendarSettings } from "../platform-settings/billing-calendar-store.mjs";
import { merchantInvoiceDueAt } from "../platform-settings/billing-calendar-rules.mjs";
import { emitDashboardLive } from "../events/dashboard-events-hub.mjs";
import { roundUsd } from "./generate-rules.mjs";
import {
  findActiveActivationBill,
  insertServiceBill,
  sendServiceBill,
} from "./service-bill-store.mjs";
import { listSettlementAddresses } from "../settlement/settlement-store.mjs";
import { findMerchantCommercial } from "../commercial/merchant-commercial-store.mjs";

async function findOrgOwnerUser(orgId) {
  const team = await listMembershipsForOrg(orgId);
  const owner = team.find((m) => m.role === "owner") ?? null;
  if (!owner) return null;
  return findUserById(owner.userId);
}

/**
 * True when merchant org profile + settlement wallet are complete and the
 * Owner has verified contact + person fields (activity gate).
 * @param {string} merchantOrgId
 */
async function merchantSetupReadyForActivation(merchantOrgId) {
  const org = await findOrgById(merchantOrgId);
  if (!org || org.type !== "merchant") return false;
  const nameOk =
    typeof org.name === "string" && org.name.trim().replace(/\s+/g, " ").length >= 2;
  const billingOk =
    typeof org.billing_email === "string" && org.billing_email.trim().includes("@");
  const countryOk =
    typeof org.country === "string" && org.country.trim().length > 0;
  if (!(nameOk && billingOk && countryOk)) return false;
  const settlements = await listSettlementAddresses(merchantOrgId);
  if (!settlements.some((r) => typeof r.address === "string" && r.address.trim())) {
    return false;
  }
  const owner = await findOrgOwnerUser(merchantOrgId);
  if (!owner) return false;
  const memberships = await listMembershipsForUser(owner.id);
  const setup = await loadOrgSetupStatus(memberships, owner);
  return setup.setupReady === true;
}

/**
 * Create activation draft (or auto-send) when a merchant becomes setup-ready.
 * Idempotent: skips if an open activation bill already exists.
 *
 * @param {string} merchantOrgId
 * @returns {Promise<object | null>}
 */
export async function ensureActivationServiceBill(merchantOrgId) {
  const org = await findOrgById(merchantOrgId);
  if (!org || org.type !== "merchant") return null;
  if (org.status === "paused") return null;

  const ready = await merchantSetupReadyForActivation(merchantOrgId);
  if (!ready) return null;

  const commercial = await findMerchantCommercial(merchantOrgId);
  if (commercial?.skip_activation) {
    if (!commercial.billing_anchor_at) {
      const { setBillingAnchorFromActivationPaid } = await import(
        "../commercial/merchant-commercial-store.mjs"
      );
      await setBillingAnchorFromActivationPaid(merchantOrgId, new Date());
    }
    return null;
  }

  const existing = await findActiveActivationBill(merchantOrgId);
  if (existing) return existing;

  const calendar = await getBillingCalendarSettings();
  const fee = roundUsd(calendar.activationFeeUsd);
  const today = new Date().toISOString().slice(0, 10);
  const dueAt = merchantInvoiceDueAt(calendar.activationPayDays);

  const initialStatus = calendar.autoSendInvoices
    ? ServiceBillStatus.Issued
    : ServiceBillStatus.Draft;

  const row = await insertServiceBill({
    orgId: merchantOrgId,
    periodStart: today,
    periodEnd: today,
    subscriptionAmount: fee,
    volumeFeeAmount: "0.00",
    totalAmount: fee,
    dueAt,
    status: initialStatus,
    tier: "small",
    volumeFeePercent: "0",
    billedVolumeUsd: "0.00",
    billKind: ServiceBillKind.Activation,
    sentAt: calendar.autoSendInvoices ? new Date().toISOString() : null,
  });

  let finalRow = row;
  if (calendar.autoSendInvoices && row.status === ServiceBillStatus.Draft) {
    finalRow = (await sendServiceBill(row.id, dueAt)) ?? row;
  }

  emitDashboardLive({
    type: calendar.autoSendInvoices
      ? "service_bill.issued"
      : "service_bill.draft",
    slices: ["serviceBills"],
    orgId: merchantOrgId,
  });

  return finalRow;
}

/**
 * @param {string} userId
 */
export async function maybeCreateActivationAfterUserSetup(userId) {
  const user = await findUserById(userId);
  if (!user) return null;
  const memberships = await listMembershipsForUser(userId);
  const setup = await loadOrgSetupStatus(memberships, user);
  if (!setup.setupReady || !setup.setupOrgId) return null;
  if (setup.setupOrgType !== "merchant") return null;
  try {
    return await ensureActivationServiceBill(setup.setupOrgId);
  } catch (err) {
    if (err && err.code === "23505") {
      return findActiveActivationBill(setup.setupOrgId);
    }
    throw err;
  }
}

/**
 * @param {string} merchantOrgId
 */
export async function maybeCreateActivationForMerchantOrg(merchantOrgId) {
  try {
    return await ensureActivationServiceBill(merchantOrgId);
  } catch (err) {
    if (err && err.code === "23505") {
      return findActiveActivationBill(merchantOrgId);
    }
    throw err;
  }
}
