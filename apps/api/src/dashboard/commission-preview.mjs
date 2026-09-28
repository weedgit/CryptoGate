import { getPool } from "../db/pool.mjs";
import {
  buildInvoiceForAgent,
  computeCommissionAmount,
  currentCommissionPeriodKey,
  formatCommissionPeriodLabel,
} from "../commercial/commission-invoice-generate.mjs";
import { DEFAULT_AGENT_COMMISSION_PERCENT } from "../commercial/agent-commission-rules.mjs";
import { getBillingCalendarSettings } from "../platform-settings/billing-calendar-store.mjs";
import { resolveAgentCommissionForPayout } from "../platform-settings/pricing-resolve.mjs";
import { listOrgsInSubtree } from "../orgs/org-scope.mjs";
import { isOrgIconValue } from "../orgs/org-accounts.mjs";
import { safeNumericSql } from "./dashboard-range.mjs";

const SETTLED = ["completed", "confirmed"];
const ORDER_USD = safeNumericSql("COALESCE(o.invoice_amount_usd, o.payable_amount)");
const BILL_FEE = `GREATEST(${safeNumericSql("b.subscription_amount")} + ${safeNumericSql("b.volume_fee_amount")}, 0)`;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** @param {Date | string | null | undefined} v */
function toUtcDay(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/**
 * UTC month bounds and the day-C invoice date for a period key.
 * @param {string} periodKey YYYY-MM
 * @param {number} payDay agentPayDayStart (1–28)
 */
export function commissionMonthBounds(periodKey, payDay) {
  const [y, m] = periodKey.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const day = Number.isFinite(Number(payDay)) && payDay >= 1 && payDay <= 28 ? Number(payDay) : 1;
  const invoiceDate = new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10);
  return { startIso: start.toISOString(), endIso: end.toISOString(), invoiceDate };
}

/**
 * Merge invoice lines (paid fee base) with order and open-bill facts, one row per merchant.
 * Commission total is computed on the summed base, exactly like the day-C invoice.
 *
 * @param {{
 *   lines: { orgId: string, name: string, billId: string | null, subscriptionAmount: number, volumeFeeAmount: number }[],
 *   commissionPercent: string,
 *   orgs: { id: string, type: string, parent_id: string | null, status: string | null }[],
 *   orders: { org_id: string, count: number | string, volume: number | string }[],
 *   openBills: { id: string, org_id: string, status: string, fee: number | string, due_at: Date | string | null }[],
 *   profiles?: { org_id: string, icon_key: string | null, billing_anchor_at: Date | string | null, next_invoice_on: Date | string | null }[],
 * }} input
 */
export function buildCommissionPreview({ lines, commissionPercent, orgs, orders, openBills, profiles = [] }) {
  const profileOf = new Map(profiles.map((p) => [p.org_id, p]));
  const byId = new Map(orgs.map((o) => [o.id, o]));
  /** Site → owning merchant (walks nested sites). */
  const merchantOf = (id) => {
    let cur = byId.get(id);
    let guard = 0;
    while (cur && cur.type !== "merchant" && cur.parent_id && guard++ < 32) {
      cur = byId.get(cur.parent_id);
    }
    return cur?.type === "merchant" ? cur.id : null;
  };

  const siteCount = new Map();
  for (const o of orgs) {
    if (o.type !== "merchant_site") continue;
    const mid = merchantOf(o.id);
    if (mid) siteCount.set(mid, (siteCount.get(mid) ?? 0) + 1);
  }

  const orderAgg = new Map();
  for (const r of orders) {
    const mid = merchantOf(r.org_id);
    if (!mid) continue;
    const prev = orderAgg.get(mid) ?? { count: 0, volume: 0 };
    orderAgg.set(mid, { count: prev.count + Number(r.count || 0), volume: prev.volume + Number(r.volume || 0) });
  }

  const billAgg = new Map();
  for (const b of openBills) {
    const prev = billAgg.get(b.org_id) ?? { count: 0, amount: 0, first: null };
    const due = b.due_at ? new Date(b.due_at).toISOString() : null;
    const first =
      !prev.first ||
      (b.status === "overdue" && prev.first.status !== "overdue") ||
      (b.status === prev.first.status && due && (!prev.first.dueAt || due < prev.first.dueAt))
        ? { id: b.id, status: b.status, dueAt: due }
        : prev.first;
    billAgg.set(b.org_id, { count: prev.count + 1, amount: prev.amount + Number(b.fee || 0), first });
  }

  let baseTotal = 0;
  const merchants = lines.map((l) => {
    const org = byId.get(l.orgId);
    const sub = round2(l.subscriptionAmount);
    const vol = round2(l.volumeFeeAmount);
    const base = round2(Math.max(sub + vol, 0));
    baseTotal += base;
    const ord = orderAgg.get(l.orgId) ?? { count: 0, volume: 0 };
    const open = billAgg.get(l.orgId);
    const profile = profileOf.get(l.orgId);
    const iconKey = profile?.icon_key && isOrgIconValue(profile.icon_key) ? profile.icon_key : null;
    return {
      orgId: l.orgId,
      name: l.name,
      iconKey,
      billingAnchorAt: toUtcDay(profile?.billing_anchor_at),
      nextInvoiceOn: toUtcDay(profile?.next_invoice_on),
      status: org?.status === "paused" ? "paused" : ord.count > 0 ? "active" : "idle",
      siteCount: siteCount.get(l.orgId) ?? 0,
      transactions: ord.count,
      volumeUsd: round2(ord.volume),
      subscriptionUsd: sub,
      volumeFeeUsd: vol,
      baseUsd: base,
      commissionUsd: computeCommissionAmount(base, commissionPercent),
      paidBillId: base > 0 ? l.billId : null,
      openBill: open
        ? { id: open.first.id, status: open.first.status, dueAt: open.first.dueAt, count: open.count, amountUsd: round2(open.amount) }
        : null,
    };
  });

  const rank = (m) => (m.openBill?.status === "overdue" ? 0 : m.openBill ? 1 : 2);
  merchants.sort((a, b) => b.commissionUsd - a.commissionUsd || rank(a) - rank(b) || b.volumeUsd - a.volumeUsd || a.name.localeCompare(b.name));

  baseTotal = round2(baseTotal);
  return {
    commissionPercent: String(commissionPercent),
    totals: {
      merchants: merchants.length,
      transactions: merchants.reduce((n, m) => n + m.transactions, 0),
      volumeUsd: round2(merchants.reduce((n, m) => n + m.volumeUsd, 0)),
      baseUsd: baseTotal,
      commissionUsd: computeCommissionAmount(baseTotal, commissionPercent),
      openBills: merchants.reduce((n, m) => n + (m.openBill?.count ?? 0), 0),
      openBillsUsd: round2(merchants.reduce((n, m) => n + (m.openBill?.amountUsd ?? 0), 0)),
    },
    merchants,
  };
}

/**
 * Brand icon and billing schedule per merchant. Older schemas without the
 * schedule columns still get icons.
 * @param {import("pg").Pool} pool
 * @param {string[]} merchantIds
 */
async function loadMerchantProfiles(pool, merchantIds) {
  try {
    const { rows } = await pool.query(
      `SELECT a.id AS org_id, a.icon_key, c.billing_anchor_at, c.next_invoice_on
       FROM org_accounts a
       LEFT JOIN merchant_commercial c ON c.org_id = a.id
       WHERE a.id = ANY($1::uuid[])`,
      [merchantIds],
    );
    return rows;
  } catch (err) {
    if (!(err && err.code === "42703")) throw err;
    const { rows } = await pool.query(
      `SELECT id AS org_id, icon_key, NULL AS billing_anchor_at, NULL AS next_invoice_on
       FROM org_accounts WHERE id = ANY($1::uuid[])`,
      [merchantIds],
    );
    return rows;
  }
}

/**
 * Platform → agent commission for the current UTC month, per merchant (not yet invoiced).
 * Only top-level agents are paid by the platform.
 * @param {string} agentId
 * @param {Date} [now]
 */
export async function loadCommissionPreview(agentId, now = new Date()) {
  const pool = getPool();
  const { rows: agentRows } = await pool.query(
    `SELECT a.id, a.name, a.type, p.type AS parent_type
     FROM org_accounts a LEFT JOIN org_accounts p ON p.id = a.parent_id
     WHERE a.id = $1::uuid`,
    [agentId],
  );
  const agent = agentRows[0];
  if (!agent || agent.type !== "agent") return { eligible: false };
  if (agent.parent_type && agent.parent_type !== "platform") return { eligible: false };

  const periodKey = currentCommissionPeriodKey(now);
  const [calendar, resolved, subtree] = await Promise.all([
    getBillingCalendarSettings(),
    resolveAgentCommissionForPayout(agentId),
    listOrgsInSubtree([agentId]),
  ]);
  const commissionPercent = resolved.commissionPercent ?? DEFAULT_AGENT_COMMISSION_PERCENT;
  const bounds = commissionMonthBounds(periodKey, calendar.agentPayDayStart);
  const invoice = await buildInvoiceForAgent(agentId, agent.name, periodKey, commissionPercent, null);

  const leafIds = subtree.filter((o) => o.type === "merchant" || o.type === "merchant_site").map((o) => o.id);
  const merchantIds = subtree.filter((o) => o.type === "merchant").map((o) => o.id);
  const [orders, openBills, profiles] = await Promise.all([
    leafIds.length
      ? pool
          .query(
            `SELECT o.org_id, count(*) AS count, COALESCE(sum(${ORDER_USD}), 0) AS volume
             FROM payment_orders o
             WHERE o.org_id = ANY($1::uuid[])
               AND o.status = ANY($2::text[])
               AND o.created_at >= $3::timestamptz AND o.created_at < $4::timestamptz
             GROUP BY o.org_id`,
            [leafIds, SETTLED, bounds.startIso, bounds.endIso],
          )
          .then((r) => r.rows)
      : [],
    merchantIds.length
      ? pool
          .query(
            `SELECT b.id, b.org_id, b.status, ${BILL_FEE} AS fee, b.due_at
             FROM service_bills b
             WHERE b.org_id = ANY($1::uuid[])
               AND b.status IN ('issued', 'overdue')
               AND COALESCE(b.bill_kind, 'monthly') = 'monthly'`,
            [merchantIds],
          )
          .then((r) => r.rows)
      : [],
    merchantIds.length ? loadMerchantProfiles(pool, merchantIds) : [],
  ]);

  const preview = buildCommissionPreview({
    lines: invoice.treeSnapshot.merchants,
    commissionPercent,
    orgs: subtree,
    orders,
    openBills,
    profiles,
  });
  return {
    eligible: true,
    periodKey,
    periodLabel: formatCommissionPeriodLabel(periodKey),
    periodStart: bounds.startIso.slice(0, 10),
    invoiceDate: bounds.invoiceDate,
    ...preview,
  };
}
