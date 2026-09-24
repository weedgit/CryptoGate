import { ServiceBillKind, ServiceBillStatus } from "@paymentgate/domain";
import { listOrgsInSubtree } from "../orgs/org-scope.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import {
  advanceNextInvoiceOn,
  consumeMerchantServiceBillCredit,
  listMerchantsDueForRecurringInvoice,
} from "../commercial/merchant-commercial-store.mjs";
import { resolveMerchantRatesForBilling } from "../platform-settings/pricing-resolve.mjs";
import { getBillingCalendarSettings } from "../platform-settings/billing-calendar-store.mjs";
import { merchantInvoiceDueAt } from "../platform-settings/billing-calendar-rules.mjs";
import { emitDashboardLive } from "../events/dashboard-events-hub.mjs";
import { addUsdAmounts } from "./service-bill-rules.mjs";
import { roundUsd, volumeFeeUsd } from "./generate-rules.mjs";
import {
  adjustServiceBillLines,
  findActiveServiceBillForPeriod,
  insertServiceBill,
  sendServiceBill,
  sumCompletedPayableVolume,
} from "./service-bill-store.mjs";
import { recurringVolumeWindow, toUtcDateString, utcToday } from "./billing-anchor-rules.mjs";

/**
 * Create one recurring (sub + volume) invoice for a merchant whose next_invoice_on is due.
 * @param {object} commercialRow
 * @param {{ today?: string, autoSend?: boolean, payDays?: number }} [opts]
 */
export async function createRecurringInvoiceForMerchant(commercialRow, opts = {}) {
  const orgId = commercialRow.org_id;
  const org = await findOrgById(orgId);
  if (!org || org.type !== "merchant") {
    return { ok: false, reason: "not_merchant" };
  }
  if (org.status === "paused") {
    return { ok: false, reason: "paused" };
  }

  const invoiceOn = toUtcDateString(commercialRow.next_invoice_on);
  if (!invoiceOn) {
    return { ok: false, reason: "no_next_invoice_on" };
  }

  if (commercialRow.fee_exempt_until) {
    const until = toUtcDateString(commercialRow.fee_exempt_until);
    if (until && until >= invoiceOn) {
      await advanceNextInvoiceOn(orgId, invoiceOn);
      return { ok: false, reason: "fee_exempt", advanced: true };
    }
  }

  const periodStart =
    toUtcDateString(commercialRow.volume_period_start) ||
    toUtcDateString(commercialRow.billing_anchor_at);
  if (!periodStart) {
    return { ok: false, reason: "no_period_start" };
  }

  const { inclusiveStartIso, exclusiveEndIso, displayPeriodEnd } =
    recurringVolumeWindow(periodStart, invoiceOn);

  const existing = await findActiveServiceBillForPeriod(orgId, periodStart);
  if (existing && existing.bill_kind !== "activation") {
    await advanceNextInvoiceOn(orgId, invoiceOn);
    return { ok: false, reason: "already_issued", advanced: true };
  }

  const subtree = await listOrgsInSubtree([orgId]);
  const volumeOrgIds = subtree
    .filter((r) => r.type === "merchant" || r.type === "merchant_site")
    .map((r) => r.id);
  const volumeRaw = await sumCompletedPayableVolume(
    volumeOrgIds,
    inclusiveStartIso,
    exclusiveEndIso,
  );
  const billedVolumeUsd = roundUsd(volumeRaw);

  const resolved = await resolveMerchantRatesForBilling(
    orgId,
    Number(billedVolumeUsd),
  );
  if (!resolved) {
    return { ok: false, reason: "no_commercial" };
  }

  const volumeFeeAmount = volumeFeeUsd(
    billedVolumeUsd,
    resolved.volumeFeePercent,
  );
  const subscriptionAmount = roundUsd(resolved.subscriptionAmountUsd);
  let totalAmount = addUsdAmounts(subscriptionAmount, volumeFeeAmount);

  const credit = await consumeMerchantServiceBillCredit(orgId, totalAmount);
  totalAmount = credit.newTotal;
  const creditAppliedUsd =
    credit.creditApplied !== "0.00" ? credit.creditApplied : null;

  const calendar = await getBillingCalendarSettings();
  const autoSend = opts.autoSend ?? calendar.autoSendInvoices;
  const payDays = opts.payDays ?? calendar.activationPayDays;
  const dueAt = merchantInvoiceDueAt(payDays);

  const initialStatus = autoSend
    ? ServiceBillStatus.Issued
    : ServiceBillStatus.Draft;

  let row = await insertServiceBill({
    orgId,
    periodStart,
    periodEnd: displayPeriodEnd,
    subscriptionAmount,
    volumeFeeAmount,
    totalAmount,
    dueAt,
    status: initialStatus,
    tier: resolved.tier,
    volumeFeePercent: String(resolved.volumeFeePercent),
    billedVolumeUsd,
    billKind: ServiceBillKind.Monthly,
    sentAt: autoSend ? new Date().toISOString() : null,
  });

  if (creditAppliedUsd) {
    row =
      (await adjustServiceBillLines(row.id, {
        subscriptionAmount,
        volumeFeeAmount,
        totalAmount,
        reason: "Applied merchant service-bill credit",
        adjustmentAmount: `-${creditAppliedUsd}`,
        creditAppliedUsd,
      })) ?? row;
  }

  if (autoSend && row.status === ServiceBillStatus.Draft) {
    row = (await sendServiceBill(row.id, dueAt)) ?? row;
  }

  await advanceNextInvoiceOn(orgId, invoiceOn);

  emitDashboardLive({
    type: autoSend ? "service_bill.issued" : "service_bill.draft",
    slices: ["serviceBills"],
    orgId,
  });

  return { ok: true, bill: row };
}

/**
 * Daily 00:00 UTC tick: create recurring invoices due on or before today.
 * @param {Date} [now]
 */
export async function runDailyServiceBillInvoiceJob(now = new Date()) {
  const today = utcToday(now);
  const due = await listMerchantsDueForRecurringInvoice(today);
  /** @type {object[]} */
  const created = [];
  /** @type {{ orgId: string, reason: string }[]} */
  const skipped = [];

  for (const row of due) {
    try {
      const result = await createRecurringInvoiceForMerchant(row, { today });
      if (result.ok) created.push(result.bill);
      else skipped.push({ orgId: row.org_id, reason: result.reason ?? "skipped" });
    } catch (err) {
      skipped.push({
        orgId: row.org_id,
        reason: err && err.message ? String(err.message) : "error",
      });
      if (process.env.NODE_ENV !== "test") {
        console.error("daily service bill invoice failed", row.org_id, err);
      }
    }
  }

  return { today, created, skipped };
}
