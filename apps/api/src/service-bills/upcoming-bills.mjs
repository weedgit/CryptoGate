import { getPool } from "../db/pool.mjs";
import { isOrgIconValue } from "../orgs/org-accounts.mjs";
import { addOneMonthUtcDateString, toUtcDateString, utcToday } from "./billing-anchor-rules.mjs";
import { findFeeWaiver } from "./billing-waiver-store.mjs";
import { estimateRecurringBill } from "./daily-invoice.mjs";
import { findActiveServiceBillForPeriod } from "./service-bill-store.mjs";
import { roundUsd } from "./generate-rules.mjs";

const MAX_UPCOMING = 500;

/**
 * Next recurring bill for one schedule: the head period, or the one after it
 * when the head bill already exists.
 * @param {{ periodStart: string, invoiceOn: string, headBillExists: boolean }} input
 */
export function nextUpcomingWindow({ periodStart, invoiceOn, headBillExists }) {
  if (!headBillExists) return { periodStart, invoiceOn };
  return {
    periodStart: invoiceOn,
    invoiceOn: addOneMonthUtcDateString(`${invoiceOn}T12:00:00.000Z`),
  };
}

/**
 * Amount the merchant will be asked to pay, after a waiver or credit.
 * @param {{ totalAmount: string, creditUsd: string, waived: boolean }} input
 */
export function upcomingPayable({ totalAmount, creditUsd, waived }) {
  if (waived) return { payable: "0.00", creditApplied: "0.00" };
  const total = Number(totalAmount) || 0;
  const credit = Math.max(Number(creditUsd) || 0, 0);
  const applied = Math.min(credit, total);
  return {
    payable: roundUsd((total - applied).toFixed(2)),
    creditApplied: roundUsd(applied.toFixed(2)),
  };
}

/**
 * @param {string[] | null} orgIds null = every merchant
 * @param {string | null} orgId
 */
async function listSchedules(orgIds, orgId) {
  const { rows } = await getPool().query(
    `SELECT c.org_id, a.name, a.status, a.icon_key,
            c.billing_anchor_at, c.next_invoice_on, c.volume_period_start,
            COALESCE(c.service_bill_credit_usd, '0.00') AS credit_usd
     FROM merchant_commercial c
     JOIN org_accounts a ON a.id = c.org_id
     WHERE a.type = 'merchant'
       AND c.billing_anchor_at IS NOT NULL
       AND c.next_invoice_on IS NOT NULL
       AND ($1::uuid[] IS NULL OR c.org_id = ANY($1::uuid[]))
       AND ($2::uuid IS NULL OR c.org_id = $2::uuid)
     ORDER BY c.next_invoice_on ASC, lower(a.name) ASC
     LIMIT ${MAX_UPCOMING}`,
    [orgIds, orgId],
  );
  return rows;
}

/**
 * Estimated next monthly bill per activated merchant, on volume so far.
 * @param {{ orgIds: string[] | null, orgId?: string | null, now?: Date }} input
 */
export async function listUpcomingBills({ orgIds, orgId = null, now = new Date() }) {
  if (Array.isArray(orgIds) && orgIds.length === 0) return [];
  const today = utcToday(now);
  const items = [];
  for (const row of await listSchedules(orgIds, orgId)) {
    const headStart =
      toUtcDateString(row.volume_period_start) || toUtcDateString(row.billing_anchor_at);
    const headInvoice = toUtcDateString(row.next_invoice_on);
    if (!headStart || !headInvoice) continue;
    const headBillExists = Boolean(await findActiveServiceBillForPeriod(row.org_id, headStart));
    const { periodStart, invoiceOn } = nextUpcomingWindow({
      periodStart: headStart,
      invoiceOn: headInvoice,
      headBillExists,
    });
    const estimate = await estimateRecurringBill(row.org_id, periodStart, invoiceOn);
    if (!estimate) continue;
    const waiver = await findFeeWaiver(row.org_id);
    const waived = Boolean(waiver);
    const { payable, creditApplied } = upcomingPayable({
      totalAmount: estimate.totalAmount,
      creditUsd: String(row.credit_usd),
      waived,
    });
    items.push({
      orgId: row.org_id,
      orgName: row.name,
      iconKey: row.icon_key && isOrgIconValue(row.icon_key) ? row.icon_key : null,
      paused: row.status === "paused",
      periodStart,
      periodEnd: estimate.periodEnd,
      invoiceOn,
      late: invoiceOn < today,
      billedVolumeUsd: estimate.billedVolumeUsd,
      subscriptionAmount: estimate.subscriptionAmount,
      volumeFeeAmount: estimate.volumeFeeAmount,
      totalAmount: estimate.totalAmount,
      creditAppliedUsd: creditApplied,
      payableAmount: payable,
      waived,
      tier: estimate.tier,
      volumeFeePercent: estimate.volumeFeePercent,
    });
  }
  items.sort(
    (a, b) => a.invoiceOn.localeCompare(b.invoiceOn) || String(a.orgName).localeCompare(String(b.orgName)),
  );
  return items;
}
