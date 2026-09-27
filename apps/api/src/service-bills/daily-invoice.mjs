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
import { findFeeWaiver } from "./billing-waiver-store.mjs";
import { closeMonthlyBillAsWaived } from "./billing-waivers.mjs";

/**
 * Amounts a recurring bill for [periodStart, invoiceOn) would have, before
 * credits and waivers. Null when the merchant has no commercial settings.
 * @param {string} orgId
 * @param {string} periodStart YYYY-MM-DD
 * @param {string} invoiceOn YYYY-MM-DD
 */
export async function estimateRecurringBill(orgId, periodStart, invoiceOn) {
  const { inclusiveStartIso, exclusiveEndIso, displayPeriodEnd } =
    recurringVolumeWindow(periodStart, invoiceOn);
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
  if (!resolved) return null;
  const volumeFeeAmount = volumeFeeUsd(billedVolumeUsd, resolved.volumeFeePercent);
  const subscriptionAmount = roundUsd(resolved.subscriptionAmountUsd);
  return {
    periodEnd: displayPeriodEnd,
    billedVolumeUsd,
    subscriptionAmount,
    volumeFeeAmount,
    totalAmount: addUsdAmounts(subscriptionAmount, volumeFeeAmount),
    tier: resolved.tier,
    volumeFeePercent: String(resolved.volumeFeePercent),
  };
}

/**
 * Insert the recurring bill for [periodStart, invoiceOn): waiver, credit and
 * auto-send follow the daily job. Does not move the merchant's schedule.
 * @param {string} orgId
 * @param {string} periodStart
 * @param {string} invoiceOn
 * @param {{ autoSend?: boolean, payDays?: number, dueFrom?: Date }} [opts]
 *   dueFrom: start of the pay-within period (default: the invoice day).
 */
export async function createRecurringBillForWindow(orgId, periodStart, invoiceOn, opts = {}) {
  const estimate = await estimateRecurringBill(orgId, periodStart, invoiceOn);
  if (!estimate) {
    return { ok: false, reason: "no_commercial" };
  }
  const { subscriptionAmount, volumeFeeAmount } = estimate;
  let totalAmount = estimate.totalAmount;

  const waiver = await findFeeWaiver(orgId);
  let creditAppliedUsd = null;
  if (!waiver) {
    const credit = await consumeMerchantServiceBillCredit(orgId, totalAmount);
    totalAmount = credit.newTotal;
    creditAppliedUsd = credit.creditApplied !== "0.00" ? credit.creditApplied : null;
  }

  const calendar = await getBillingCalendarSettings();
  const autoSend = !waiver && (opts.autoSend ?? calendar.autoSendInvoices);
  const payDays = opts.payDays ?? calendar.activationPayDays;
  // Daily-job catch-up keeps due_at on invoiceOn + payDays; a missed invoice an
  // admin creates later passes dueFrom so the merchant still gets the full period.
  const dueAt = merchantInvoiceDueAt(
    payDays,
    opts.dueFrom ?? new Date(`${invoiceOn}T00:00:00.000Z`),
  );

  let row = await insertServiceBill({
    orgId,
    periodStart,
    periodEnd: estimate.periodEnd,
    subscriptionAmount,
    volumeFeeAmount,
    totalAmount,
    dueAt,
    status: autoSend ? ServiceBillStatus.Issued : ServiceBillStatus.Draft,
    tier: estimate.tier,
    volumeFeePercent: estimate.volumeFeePercent,
    billedVolumeUsd: estimate.billedVolumeUsd,
    billKind: ServiceBillKind.Monthly,
    sentAt: autoSend ? new Date().toISOString() : null,
  });

  if (waiver) {
    row = await closeMonthlyBillAsWaived(row, waiver);
    return { ok: true, bill: row, waived: true };
  }

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

  emitDashboardLive({
    type: autoSend ? "service_bill.issued" : "service_bill.draft",
    slices: ["serviceBills"],
    orgId,
  });

  return { ok: true, bill: row };
}

/**
 * Create one recurring (sub + volume) invoice for a merchant whose next_invoice_on is due.
 * @param {object} commercialRow
 * @param {{ today?: string, autoSend?: boolean, payDays?: number, dueFrom?: Date }} [opts]
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

  const periodStart =
    toUtcDateString(commercialRow.volume_period_start) ||
    toUtcDateString(commercialRow.billing_anchor_at);
  if (!periodStart) {
    return { ok: false, reason: "no_period_start" };
  }

  const existing = await findActiveServiceBillForPeriod(orgId, periodStart);
  if (existing && existing.bill_kind !== "activation") {
    await advanceNextInvoiceOn(orgId, invoiceOn);
    return { ok: false, reason: "already_issued", advanced: true };
  }

  const result = await createRecurringBillForWindow(orgId, periodStart, invoiceOn, opts);
  if (result.ok) await advanceNextInvoiceOn(orgId, invoiceOn);
  return result;
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
