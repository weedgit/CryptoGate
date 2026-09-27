import { getPool } from "../db/pool.mjs";
import { listOrgAccounts } from "../orgs/org-store.mjs";
import {
  findMerchantCommercial,
  listMerchantsDueForRecurringInvoice,
} from "../commercial/merchant-commercial-store.mjs";
import {
  addOneMonthUtcDateString,
  recurringVolumeWindow,
  toUtcDateString,
} from "./billing-anchor-rules.mjs";
import { listFeeWaivers } from "./billing-waiver-store.mjs";
import {
  createRecurringBillForWindow,
  createRecurringInvoiceForMerchant,
  estimateRecurringBill,
} from "./daily-invoice.mjs";
import { findActiveServiceBillForPeriod } from "./service-bill-store.mjs";
import { missedInvoiceBlockerMessage } from "./missed-invoice-rules.mjs";

/** Bill dates walked forward from a stuck schedule (≈ 3 years). */
const MAX_SCHEDULE_STEPS = 36;
const MAX_RESULTS = 500;

/**
 * Periods whose only monthly bill was cancelled, with invoice day in range.
 * @param {string} from
 * @param {string} to
 * @param {string | null} orgId
 */
async function listCancelledGaps(from, to, orgId) {
  const { rows } = await getPool().query(
    `SELECT b.org_id,
            to_char(b.period_start, 'YYYY-MM-DD') AS period_start,
            to_char(b.period_end + 1, 'YYYY-MM-DD') AS invoice_on
     FROM service_bills b
     WHERE COALESCE(b.bill_kind, 'monthly') = 'monthly'
       AND b.status = 'cancelled'
       AND (b.period_end + 1) BETWEEN $1::date AND $2::date
       AND ($3::uuid IS NULL OR b.org_id = $3::uuid)
       AND NOT EXISTS (
         SELECT 1 FROM service_bills a
         WHERE a.org_id = b.org_id
           AND a.period_start = b.period_start
           AND a.status <> 'cancelled'
           AND COALESCE(a.bill_kind, 'monthly') = 'monthly'
       )
     GROUP BY b.org_id, b.period_start, b.period_end`,
    [from, to, orgId],
  );
  return rows;
}

/**
 * Invoices that should exist by each merchant's payment-date schedule but do not.
 * Any non-cancelled monthly bill (draft, issued, overdue, paid, waived) for the
 * period counts as created. Two sources:
 *  - schedule: next_invoice_on stuck on or before `to` (the daily job only
 *    advances it after a bill exists), walked forward month by month;
 *  - cancelled: a period whose only bill was cancelled (flagged for review).
 *
 * @param {{ from: string, to: string, orgId?: string | null }} input
 */
export async function findMissedInvoices({ from, to, orgId = null }) {
  const orgs = await listOrgAccounts();
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const waived = new Set((await listFeeWaivers()).map((w) => w.org_id));

  /** @type {object[]} */
  const missed = [];
  const seen = new Set();

  async function push(org, periodStart, invoiceOn, extra) {
    const key = `${org.id}|${periodStart}`;
    if (seen.has(key) || missed.length >= MAX_RESULTS) return;
    seen.add(key);
    const estimate = await estimateRecurringBill(org.id, periodStart, invoiceOn);
    let blocker = extra.blocker;
    if (!blocker && org.status === "paused") blocker = "paused";
    if (!blocker && !estimate) blocker = "no_commercial";
    missed.push({
      orgId: org.id,
      orgName: org.name,
      periodStart,
      periodEnd:
        estimate?.periodEnd ?? recurringVolumeWindow(periodStart, invoiceOn).displayPeriodEnd,
      invoiceOn,
      previouslyCancelled: extra.previouslyCancelled,
      blocker: blocker ?? null,
      blockerMessage: blocker ? missedInvoiceBlockerMessage(blocker) : null,
      earlierInvoiceOn: extra.earlierInvoiceOn ?? null,
      willBeWaived: waived.has(org.id),
      estimate: estimate
        ? {
            subscriptionAmount: estimate.subscriptionAmount,
            volumeFeeAmount: estimate.volumeFeeAmount,
            totalAmount: estimate.totalAmount,
            billedVolumeUsd: estimate.billedVolumeUsd,
          }
        : null,
    });
  }

  let schedules;
  if (orgId) {
    const row = await findMerchantCommercial(orgId);
    schedules = row ? [row] : [];
  } else {
    schedules = await listMerchantsDueForRecurringInvoice(to);
  }

  for (const row of schedules) {
    const org = orgById.get(row.org_id);
    if (!org || org.type !== "merchant" || !row.billing_anchor_at) continue;
    let periodStart =
      toUtcDateString(row.volume_period_start) || toUtcDateString(row.billing_anchor_at);
    let invoiceOn = toUtcDateString(row.next_invoice_on);
    if (!periodStart || !invoiceOn || invoiceOn > to) continue;
    // A bill already exists for the head period: the next daily run advances it.
    if (await findActiveServiceBillForPeriod(org.id, periodStart)) continue;

    const head = invoiceOn;
    for (let step = 0; step < MAX_SCHEDULE_STEPS && invoiceOn <= to; step += 1) {
      if (invoiceOn >= from) {
        await push(org, periodStart, invoiceOn, {
          previouslyCancelled: false,
          blocker: step > 0 ? "earlier_first" : null,
          earlierInvoiceOn: step > 0 ? head : null,
        });
      }
      periodStart = invoiceOn;
      invoiceOn = addOneMonthUtcDateString(`${invoiceOn}T12:00:00.000Z`);
    }
  }

  for (const gap of await listCancelledGaps(from, to, orgId)) {
    const org = orgById.get(gap.org_id);
    if (!org || org.type !== "merchant") continue;
    await push(org, gap.period_start, gap.invoice_on, {
      previouslyCancelled: true,
      blocker: null,
    });
  }

  missed.sort(
    (a, b) =>
      a.invoiceOn.localeCompare(b.invoiceOn) ||
      String(a.orgName).localeCompare(String(b.orgName)),
  );
  return missed;
}

/**
 * Create one missed invoice after admin review. Rechecks it is still missed,
 * so a bill the daily job created in the meantime is never duplicated.
 * @param {{ orgId: string, periodStart: string, today: string }} input
 */
export async function createMissedInvoice({ orgId, periodStart, today }) {
  const candidates = await findMissedInvoices({ from: "2000-01-01", to: today, orgId });
  const candidate = candidates.find((c) => c.periodStart === periodStart);
  if (!candidate) {
    return {
      ok: false,
      status: 409,
      code: "not_missed",
      message: "This invoice was already created or is not due yet",
    };
  }
  if (candidate.blocker) {
    return {
      ok: false,
      status: 422,
      code: candidate.blocker,
      message: candidate.blockerMessage,
    };
  }

  // Pay-within counts from today, not the missed invoice day.
  const dueFrom = new Date();
  let result;
  try {
    if (candidate.previouslyCancelled) {
      result = await createRecurringBillForWindow(orgId, periodStart, candidate.invoiceOn, {
        dueFrom,
      });
    } else {
      const row = await findMerchantCommercial(orgId);
      result = row
        ? await createRecurringInvoiceForMerchant(row, { today, dueFrom })
        : { ok: false, reason: "no_commercial" };
    }
  } catch (err) {
    if (err && err.code === "23505") {
      return {
        ok: false,
        status: 409,
        code: "not_missed",
        message: "This invoice was already created",
      };
    }
    throw err;
  }

  if (!result.ok) {
    if (result.reason === "already_issued") {
      return {
        ok: false,
        status: 409,
        code: "not_missed",
        message: "This invoice was already created",
      };
    }
    return {
      ok: false,
      status: 422,
      code: result.reason ?? "not_created",
      message: missedInvoiceBlockerMessage(result.reason ?? ""),
    };
  }
  return { ok: true, bill: result.bill, candidate };
}
