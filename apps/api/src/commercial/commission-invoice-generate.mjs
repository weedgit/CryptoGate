/**
 * Platform → agent commission invoices from paid merchant service fees.
 * Auto-created at 00:00 UTC on agent pay day C (billing calendar).
 */
import { resolvePlatformFeeNetwork } from "@paymentgate/domain";
import { listOrgsInSubtree } from "../orgs/org-scope.mjs";
import { listOrgAccounts } from "../orgs/org-store.mjs";
import { getPool } from "../db/pool.mjs";
import {
  DEFAULT_AGENT_COMMISSION_PERCENT,
} from "./agent-commission-rules.mjs";
import { listAgentPayoutAddressesByOrgIds } from "./agent-payout-store.mjs";
import { upsertIssuedCommissionInvoiceRow } from "./commission-payout-store.mjs";
import { resolveAgentCommissionForPayout } from "../platform-settings/pricing-resolve.mjs";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * @param {string} periodKey YYYY-MM → "Aug 2026"
 */
export function formatCommissionPeriodLabel(periodKey) {
  const [yRaw, mRaw] = periodKey.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return periodKey;
  }
  const mon = MONTH_LABELS[m - 1] ?? mRaw;
  return `${mon} ${y}`;
}

/**
 * @param {string} periodKey
 */
export function validatePeriodKey(periodKey) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "periodKey must be YYYY-MM",
    };
  }
  return { ok: true };
}

/**
 * Prior UTC calendar month as YYYY-MM.
 * Default period for auto + manual commission invoice generate.
 * @param {Date} [now]
 */
export function previousCommissionPeriodKey(now = new Date()) {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Default commission period = prior UTC month (matches day-C auto job).
 * @param {Date} [now]
 */
export function defaultCommissionPeriodKey(now = new Date()) {
  return previousCommissionPeriodKey(now);
}

/**
 * Current UTC calendar month as YYYY-MM (ops override only).
 * @param {Date} [now]
 */
export function currentCommissionPeriodKey(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * True on UTC calendar day C (agentPayDayStart).
 * @param {Date} now
 * @param {number} agentPayDayStart
 */
export function isAgentCommissionInvoiceDay(now, agentPayDayStart) {
  const c = Number(agentPayDayStart);
  if (!Number.isFinite(c) || c < 1 || c > 28) return false;
  return now.getUTCDate() === c;
}

/**
 * Catch-up while still inside the remittance window [start, end] (UTC day).
 * @param {Date} now
 * @param {number} agentPayDayStart
 * @param {number} agentPayDayEnd
 */
export function isAgentCommissionCatchUpDay(
  now,
  agentPayDayStart,
  agentPayDayEnd,
) {
  const start = Number(agentPayDayStart);
  const end = Number(agentPayDayEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const day = now.getUTCDate();
  return day >= start && day <= end;
}

/**
 * Collected platform fee on a paid monthly bill: subscription + volume.
 * Activation fees are excluded by the caller (bill_kind filter).
 * @param {string | number | null | undefined} subscription
 * @param {string | number | null | undefined} volumeFee
 */
export function paidPlatformFeeUsd(subscription, volumeFee) {
  const sub = Number(subscription);
  const vol = Number(volumeFee);
  const s = Number.isFinite(sub) ? sub : 0;
  const v = Number.isFinite(vol) ? vol : 0;
  const total = Math.round((s + v) * 100) / 100;
  return total > 0 ? total : 0;
}

/**
 * @param {number} feeCollected
 * @param {string | number} commissionPercent
 */
export function computeCommissionAmount(feeCollected, commissionPercent) {
  const fee = Number(feeCollected);
  const base = Number.isFinite(fee) && fee > 0 ? fee : 0;
  const bps = Math.round(Number(commissionPercent) * 100) || 0;
  return Math.round(base * (bps / 10_000) * 100) / 100;
}

/**
 * Paid-at window for periodKey (UTC month).
 * @param {string} periodKey
 */
function periodPaidBounds(periodKey) {
  const [y, m] = periodKey.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return {
    startIso: start.toISOString(),
    endExclusiveIso: end.toISOString(),
  };
}

/**
 * @param {import("pg").QueryResultRow[]} orgs
 */
function isTopLevelAgent(org, byId) {
  if (org.type !== "agent" && org.type !== "agent_sub") return false;
  if (!org.parent_id) return true;
  const parent = byId.get(org.parent_id);
  return parent?.type === "platform";
}

/**
 * @param {string} agentId
 * @param {string} agentName
 * @param {string} periodKey
 * @param {string} commissionPercent
 * @param {{ address: string, asset: string, network: string } | null} payout
 * @param {{ payer?: string, payerOrgId?: string | null, paymentLink?: string }} [extras]
 */
async function buildInvoiceForAgent(
  agentId,
  agentName,
  periodKey,
  commissionPercent,
  payout,
  extras = {},
) {
  const subtree = await listOrgsInSubtree([agentId]);
  const merchants = subtree.filter(
    (o) => o.type === "merchant" || o.type === "merchant_site",
  );
  const merchantIds = merchants.map((m) => m.id);
  const { startIso, endExclusiveIso } = periodPaidBounds(periodKey);

  /** @type {Map<string, import("pg").QueryResultRow[]>} */
  const billsByOrg = new Map();
  if (merchantIds.length > 0) {
    const { rows } = await getPool().query(
      `SELECT id, org_id, status, subscription_amount, volume_fee_amount,
              period_start, period_end, paid_at, bill_kind
       FROM service_bills
       WHERE org_id = ANY($1::uuid[])
         AND status = 'paid'
         AND paid_at >= $2::timestamptz
         AND paid_at < $3::timestamptz
         AND COALESCE(bill_kind, 'monthly') = 'monthly'
       ORDER BY paid_at ASC`,
      [merchantIds, startIso, endExclusiveIso],
    );
    for (const b of rows) {
      const list = billsByOrg.get(b.org_id) ?? [];
      list.push(b);
      billsByOrg.set(b.org_id, list);
    }
  }

  let feeCollected = 0;
  const lines = merchants.map((m) => {
    const bills = billsByOrg.get(m.id) ?? [];
    let subscription = 0;
    let volumeFee = 0;
    /** @type {string | null} */
    let billId = null;
    for (const bill of bills) {
      const sub = Number(bill.subscription_amount);
      const vol = Number(bill.volume_fee_amount);
      if (Number.isFinite(sub)) subscription += sub;
      if (Number.isFinite(vol)) volumeFee += vol;
      if (!billId) billId = bill.id ?? null;
    }
    subscription = Math.round(subscription * 100) / 100;
    volumeFee = Math.round(volumeFee * 100) / 100;
    const fee = paidPlatformFeeUsd(subscription, volumeFee);
    const included = fee > 0;
    if (included) feeCollected += fee;
    return {
      orgId: m.id,
      name: m.name,
      type: m.type,
      onboardedAt: m.created_at
        ? new Date(m.created_at).toISOString()
        : null,
      billId,
      billStatus: included ? "paid" : null,
      subscriptionAmount: subscription,
      volumeFeeAmount: volumeFee,
      includedInCommission: included,
      paidBillCount: bills.length,
    };
  });

  feeCollected = Math.round(feeCollected * 100) / 100;
  const commissionAmount = computeCommissionAmount(
    feeCollected,
    commissionPercent,
  );
  const periodLabel = formatCommissionPeriodLabel(periodKey);
  const payer = extras.payer === "agent" ? "agent" : "platform";
  const payerOrgId = payer === "agent" ? extras.payerOrgId ?? null : null;
  const paymentLink =
    extras.paymentLink ??
    (payer === "agent"
      ? `/agent/commissions?payee=${encodeURIComponent(agentId)}&period=${encodeURIComponent(periodKey)}`
      : `/platform/commissions?tab=invoices&payee=${encodeURIComponent(agentId)}&period=${encodeURIComponent(periodKey)}`);

  return {
    payeeOrgId: agentId,
    payeeName: agentName,
    payer,
    payerOrgId,
    periodKey,
    periodLabel,
    platformFeeCollected: feeCollected,
    commissionPercent: String(commissionPercent),
    commissionAmount,
    payoutAddress: payout?.address ?? null,
    asset: payout?.asset ?? "USDT",
    network: payout?.network ?? resolvePlatformFeeNetwork(),
    paymentLink,
    treeSnapshot: {
      periodKey,
      generatedAt: new Date().toISOString(),
      merchants: lines,
    },
  };
}

/**
 * Generate / refresh issued invoices for all top-level agents for periodKey.
 * Skips agents whose invoice is already paid or settled.
 * @param {string} periodKey
 */
export async function generateMonthlyCommissionInvoices(periodKey) {
  const orgs = await listOrgAccounts();
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const topAgents = orgs.filter((o) => isTopLevelAgent(o, byId));
  const agentIds = topAgents.map((a) => a.id);
  const payouts = await listAgentPayoutAddressesByOrgIds(agentIds);
  const payoutBy = new Map(
    payouts.map((p) => [
      p.org_id,
      { address: p.address, asset: p.asset, network: p.network },
    ]),
  );

  const created = [];
  const skipped = [];
  for (const agent of topAgents) {
    const resolved = await resolveAgentCommissionForPayout(agent.id);
    const input = await buildInvoiceForAgent(
      agent.id,
      agent.name,
      periodKey,
      resolved.commissionPercent ?? DEFAULT_AGENT_COMMISSION_PERCENT,
      payoutBy.get(agent.id) ?? null,
    );
    const row = await upsertIssuedCommissionInvoiceRow(input);
    if (!row) {
      skipped.push({
        payeeOrgId: agent.id,
        payeeName: agent.name,
        reason: "already_paid_or_settled",
      });
      continue;
    }
    created.push(row);
  }
  return { created, skipped, periodKey, periodLabel: formatCommissionPeriodLabel(periodKey) };
}
