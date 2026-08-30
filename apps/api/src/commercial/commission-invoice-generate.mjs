/**
 * Month-end platform → agent commission invoices from subtree service fees.
 */
import { listOrgsInSubtree } from "../orgs/org-scope.mjs";
import { listOrgAccounts } from "../orgs/org-store.mjs";
import { getPool } from "../db/pool.mjs";
import {
  DEFAULT_AGENT_COMMISSION_PERCENT,
} from "./agent-commission-rules.mjs";
import { listAgentCommissionsByOrgIds } from "./agent-commission-store.mjs";
import { listAgentPayoutAddressesByOrgIds } from "./agent-payout-store.mjs";
import { upsertIssuedCommissionInvoiceRow } from "./commission-payout-store.mjs";

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
 * Current calendar month as YYYY-MM (UTC).
 */
export function defaultCommissionPeriodKey(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * @param {string} periodKey
 */
function periodBounds(periodKey) {
  const [y, m] = periodKey.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return {
    startIso: start.toISOString().slice(0, 10),
    endExclusiveIso: end.toISOString().slice(0, 10),
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
 * @param {string} periodKey
 * @param {string} commissionPercent
 * @param {{ address: string, asset: string, network: string } | null} payout
 */
async function buildInvoiceForAgent(
  agentId,
  agentName,
  periodKey,
  commissionPercent,
  payout,
) {
  const subtree = await listOrgsInSubtree([agentId]);
  const merchants = subtree.filter(
    (o) => o.type === "merchant" || o.type === "merchant_site",
  );
  const merchantIds = merchants.map((m) => m.id);
  const { startIso, endExclusiveIso } = periodBounds(periodKey);

  /** @type {Map<string, import("pg").QueryResultRow>} */
  const billByOrg = new Map();
  if (merchantIds.length > 0) {
    const { rows } = await getPool().query(
      `SELECT id, org_id, status, subscription_amount, volume_fee_amount,
              period_start, period_end
       FROM service_bills
       WHERE org_id = ANY($1::uuid[])
         AND period_start >= $2::date
         AND period_start < $3::date
       ORDER BY period_start ASC`,
      [merchantIds, startIso, endExclusiveIso],
    );
    for (const b of rows) {
      // One bill per merchant per period expected; keep first if duplicates.
      if (!billByOrg.has(b.org_id)) billByOrg.set(b.org_id, b);
    }
  }

  let feeCollected = 0;
  const lines = merchants.map((m) => {
    const bill = billByOrg.get(m.id) ?? null;
    const volumeFee = bill ? Number(bill.volume_fee_amount) : 0;
    const subscription = bill ? Number(bill.subscription_amount) : 0;
    const status = bill?.status ?? null;
    const included =
      status === "paid" && Number.isFinite(volumeFee) && volumeFee > 0;
    if (included) feeCollected += volumeFee;
    return {
      orgId: m.id,
      name: m.name,
      type: m.type,
      onboardedAt: m.created_at
        ? new Date(m.created_at).toISOString()
        : null,
      billId: bill?.id ?? null,
      billStatus: status,
      subscriptionAmount: Number.isFinite(subscription) ? subscription : 0,
      volumeFeeAmount: Number.isFinite(volumeFee) ? volumeFee : 0,
      includedInCommission: included,
    };
  });

  feeCollected = Math.round(feeCollected * 100) / 100;
  const bps = Math.round(Number(commissionPercent) * 100) || 0;
  const commissionAmount =
    Math.round(feeCollected * (bps / 10_000) * 100) / 100;
  const periodLabel = formatCommissionPeriodLabel(periodKey);
  const paymentLink = `/platform/commissions?tab=invoices&payee=${encodeURIComponent(agentId)}&period=${encodeURIComponent(periodKey)}`;

  return {
    payeeOrgId: agentId,
    payeeName: agentName,
    payer: "platform",
    payerOrgId: null,
    periodKey,
    periodLabel,
    platformFeeCollected: feeCollected,
    commissionPercent: String(commissionPercent),
    commissionAmount,
    payoutAddress: payout?.address ?? null,
    asset: payout?.asset ?? "USDT",
    network: payout?.network ?? "tron",
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
  const [commissions, payouts] = await Promise.all([
    listAgentCommissionsByOrgIds(agentIds),
    listAgentPayoutAddressesByOrgIds(agentIds),
  ]);
  const pctBy = new Map(
    commissions.map((c) => [c.org_id, String(c.commission_percent)]),
  );
  const payoutBy = new Map(
    payouts.map((p) => [
      p.org_id,
      { address: p.address, asset: p.asset, network: p.network },
    ]),
  );

  const created = [];
  const skipped = [];
  for (const agent of topAgents) {
    const input = await buildInvoiceForAgent(
      agent.id,
      agent.name,
      periodKey,
      pctBy.get(agent.id) ?? DEFAULT_AGENT_COMMISSION_PERCENT,
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
