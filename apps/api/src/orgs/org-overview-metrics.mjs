import { getPool } from "../db/pool.mjs";
import { safeNumericSql } from "../dashboard/dashboard-range.mjs";
import { appendPaymentOrderScope } from "../orders/order-scope-sql.mjs";

const SETTLED = ["completed", "confirmed"];
const OPEN = ["pending_payment", "verifying", "payment_anomaly"];
const ORDER_USD = safeNumericSql("COALESCE(o.invoice_amount_usd, o.payable_amount)");
const BILL_FEE = `GREATEST(${safeNumericSql("b.subscription_amount")} + ${safeNumericSql("b.volume_fee_amount")}, 0)`;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Start of the current UTC calendar month. */
export function utcMonthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Merchant billing period start: current UTC month, or onboarding if later.
 * @param {Date | string | null | undefined} createdAt
 */
export function merchantPeriodStart(createdAt, now = new Date()) {
  const month = utcMonthStart(now);
  const onboard = createdAt ? new Date(createdAt) : null;
  return onboard && Number.isFinite(onboard.getTime()) && onboard > month ? onboard : month;
}

/**
 * Period-to-date order totals for the detail cards (one aggregate scan).
 * @param {{ kind: "all" | "filter", treeOrgIds?: string[], cashierOrgIds?: string[], createdBy?: string | null }} filter
 * @param {{ orgId?: string | null, since: Date }} opts
 */
export async function overviewOrderMetrics(filter, opts) {
  const empty = { orders: 0, settledVolumeUsd: 0, open: 0 };
  const params = [SETTLED, OPEN, opts.since.toISOString()];
  const sc = appendPaymentOrderScope(filter, params);
  if (sc.empty) return empty;
  let orgSql = "";
  if (opts.orgId) {
    params.push(opts.orgId);
    orgSql = `AND o.org_id = $${params.length}::uuid`;
  }
  const { rows } = await getPool().query(
    `SELECT
       count(*) FILTER (WHERE o.created_at >= $3::timestamptz) AS orders,
       COALESCE(sum(${ORDER_USD}) FILTER (
         WHERE o.created_at >= $3::timestamptz AND o.status = ANY($1::text[])
       ), 0) AS vol,
       count(*) FILTER (WHERE o.status = ANY($2::text[])) AS open
     FROM payment_orders o
     WHERE (o.created_at >= $3::timestamptz OR o.status = ANY($2::text[]))
       ${sc.clause} ${orgSql}`,
    params,
  );
  const r = rows[0] ?? {};
  return {
    orders: Number(r.orders) || 0,
    settledVolumeUsd: round2(r.vol),
    open: Number(r.open) || 0,
  };
}

/**
 * Platform fees (subscription + volume) on live bills whose period overlaps
 * the current UTC month — agent commission MTD basis.
 * @param {string[]} merchantOrgIds
 */
export async function platformFeeMonthToDate(merchantOrgIds, now = new Date()) {
  if (merchantOrgIds.length === 0) return 0;
  const start = utcMonthStart(now);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const { rows } = await getPool().query(
    `SELECT COALESCE(sum(${BILL_FEE}), 0) AS fee
     FROM service_bills b
     WHERE b.org_id = ANY($1::uuid[])
       AND b.status NOT IN ('voided', 'cancelled')
       AND b.period_start <= $3::date
       AND b.period_end >= $2::date`,
    [merchantOrgIds, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)],
  );
  return round2(rows[0]?.fee);
}
