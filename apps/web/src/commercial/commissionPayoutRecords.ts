import type { CommissionStatementRow } from "./commissionStatements";
import {
  agentRoute,
  platformRoute,
  portalHref,
  type PortalId,
} from "../shared/portalRouting";

export type CommissionTreeMerchantLine = {
  orgId: string;
  name: string;
  type: string;
  onboardedAt: string | null;
  billId: string | null;
  billStatus: string | null;
  subscriptionAmount: number;
  volumeFeeAmount: number;
  includedInCommission: boolean;
};

export type CommissionTreeSnapshot = {
  periodKey: string;
  generatedAt: string;
  merchants: CommissionTreeMerchantLine[];
};

export type CommissionPayoutRecord = {
  id: string;
  payeeOrgId: string;
  payeeName: string;
  payer: "platform";
  payerOrgId: string | null;
  periodKey: string;
  periodLabel: string;
  platformFeeCollected: number;
  commissionPercent: string;
  commissionAmount: number;
  payoutStatus: "issued" | "paid" | "settled";
  payoutAddress: string | null;
  asset: string | null;
  network: string | null;
  paymentLink: string;
  txRef: string | null;
  note?: string | null;
  treeSnapshot?: CommissionTreeSnapshot | null;
  paidAt: string | null;
  settledAt?: string | null;
  agentConfirmedBy?: string | null;
  updatedAt: string;
};

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  "/v1";

async function parseError(res: Response): Promise<never> {
  let message = res.statusText || `HTTP ${res.status}`;
  try {
    const data = (await res.json()) as { message?: string; error?: string };
    if (data.message) message = data.message;
    else if (data.error) message = data.error;
  } catch {
    /* ignore */
  }
  throw new Error(message);
}

export async function listCommissionPayouts(filter?: {
  payer?: "platform";
  payeeOrgId?: string;
  payerOrgId?: string;
  /** Comma-separated or array: issued | paid | settled */
  status?: string | string[];
  limit?: number;
  offset?: number;
}): Promise<{
  items: CommissionPayoutRecord[];
  total: number;
  limit: number;
  offset: number;
}> {
  const q = new URLSearchParams();
  if (filter?.payer) q.set("payer", filter.payer);
  if (filter?.payeeOrgId) q.set("payeeOrgId", filter.payeeOrgId);
  if (filter?.payerOrgId) q.set("payerOrgId", filter.payerOrgId);
  if (filter?.status != null) {
    const status = Array.isArray(filter.status)
      ? filter.status.join(",")
      : filter.status;
    if (status) q.set("status", status);
  }
  if (filter?.limit != null) q.set("limit", String(filter.limit));
  if (filter?.offset != null) q.set("offset", String(filter.offset));
  const suffix = q.toString() ? `?${q}` : "";
  const res = await fetch(`${API_BASE}/commission-payouts${suffix}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as {
    items: CommissionPayoutRecord[];
    total?: number;
    limit?: number;
    offset?: number;
  };
  const rows = data.items ?? [];
  rows.sort((a, b) => {
    const p = b.periodKey.localeCompare(a.periodKey);
    if (p !== 0) return p;
    return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  });
  return {
    items: rows,
    total: data.total ?? rows.length,
    limit: data.limit ?? filter?.limit ?? 200,
    offset: data.offset ?? filter?.offset ?? 0,
  };
}

const LIST_ALL_PAGE = 500;

/** Walk offset pages until loaded === total (deduped by id). */
export async function listAllCommissionPayouts(filter?: {
  payer?: "platform";
  payeeOrgId?: string;
  payerOrgId?: string;
  status?: string | string[];
}): Promise<CommissionPayoutRecord[]> {
  let offset = 0;
  let total = Infinity;
  const out: CommissionPayoutRecord[] = [];
  const seen = new Set<string>();
  while (offset < total) {
    const page = await listCommissionPayouts({
      ...filter,
      limit: LIST_ALL_PAGE,
      offset,
    });
    total = page.total;
    for (const row of page.items) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
    if (page.items.length === 0) break;
    offset += page.items.length;
  }
  return out;
}

export { sumCommissionDashboardKpis, commissionMonthKeys } from "./commissionDashboardKpis";
import { sumCommissionDashboardKpis } from "./commissionDashboardKpis";

/**
 * Platform dashboard commission KPIs — status-scoped full walks so large
 * history does not silently truncate at one page.
 */
export async function fetchPlatformCommissionDashboardKpis(
  monthKeys: Set<string>,
): Promise<{ commissionOwed: number; commissionPaid: number }> {
  const [issued, remitted] = await Promise.all([
    listAllCommissionPayouts({ payer: "platform", status: "issued" }),
    listAllCommissionPayouts({
      payer: "platform",
      status: ["paid", "settled"],
    }),
  ]);
  const owed = sumCommissionDashboardKpis(issued, monthKeys);
  const paid = sumCommissionDashboardKpis(remitted, monthKeys);
  return {
    commissionOwed: owed.commissionOwed,
    commissionPaid: paid.commissionPaid,
  };
}

/** Agent dashboard KPIs for platform → this agent slips. */
export async function fetchAgentCommissionDashboardKpis(
  payeeOrgId: string,
  monthKeys: Set<string>,
): Promise<{ commissionOwed: number; commissionPaid: number }> {
  const [issued, remitted] = await Promise.all([
    listAllCommissionPayouts({
      payer: "platform",
      payeeOrgId,
      status: "issued",
    }),
    listAllCommissionPayouts({
      payer: "platform",
      payeeOrgId,
      status: ["paid", "settled"],
    }),
  ]);
  const owed = sumCommissionDashboardKpis(issued, monthKeys);
  const paid = sumCommissionDashboardKpis(remitted, monthKeys);
  return {
    commissionOwed: owed.commissionOwed,
    commissionPaid: paid.commissionPaid,
  };
}

export async function generateCommissionInvoices(periodKey?: string): Promise<{
  periodKey: string;
  periodLabel: string;
  created: CommissionPayoutRecord[];
  skipped: { payeeOrgId: string; payeeName: string; reason: string }[];
}> {
  const res = await fetch(`${API_BASE}/commission-payouts/generate`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(periodKey ? { periodKey } : {}),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as {
    periodKey: string;
    periodLabel: string;
    created: CommissionPayoutRecord[];
    skipped: { payeeOrgId: string; payeeName: string; reason: string }[];
  };
}

export async function getCommissionPayout(
  id: string,
): Promise<CommissionPayoutRecord | null> {
  const res = await fetch(
    `${API_BASE}/commission-payouts/${encodeURIComponent(id)}`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) await parseError(res);
  return (await res.json()) as CommissionPayoutRecord;
}

export async function markCommissionPayoutPaid(
  id: string,
  opts?: { txRef?: string | null; note?: string | null },
): Promise<CommissionPayoutRecord | null> {
  const res = await fetch(
    `${API_BASE}/commission-payouts/${encodeURIComponent(id)}/mark-paid`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        txRef: opts?.txRef?.trim() || null,
        note: opts?.note?.trim() || null,
      }),
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) await parseError(res);
  return (await res.json()) as CommissionPayoutRecord;
}

export async function markCommissionPayoutsPaidBatch(
  ids: string[],
  opts: { note: string; txRef?: string | null },
): Promise<{
  paid: CommissionPayoutRecord[];
  failed: { id: string; code: string; message: string }[];
}> {
  const res = await fetch(`${API_BASE}/commission-payouts/mark-paid-batch`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ids,
      note: opts.note.trim(),
      txRef: opts.txRef?.trim() || null,
    }),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as {
    paid: CommissionPayoutRecord[];
    failed: { id: string; code: string; message: string }[];
  };
}

export async function agentConfirmCommissionPayout(
  id: string,
): Promise<CommissionPayoutRecord | null> {
  const res = await fetch(
    `${API_BASE}/commission-payouts/${encodeURIComponent(id)}/agent-confirm`,
    {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) await parseError(res);
  return (await res.json()) as CommissionPayoutRecord;
}

/**
 * In-app path to a commission invoice detail page.
 * Platform ops store `/platform/commissions/:id`; agents open `/agent/commissions/:id`.
 */
export function commissionInvoiceDetailPath(
  portal: Extract<PortalId, "platform" | "agent">,
  payoutId: string,
): string {
  const id = payoutId.trim();
  if (!id) return portal === "agent" ? agentRoute("commissions") : platformRoute("commissions");
  return portal === "agent"
    ? agentRoute(`commissions/${id}`)
    : platformRoute(`commissions/${id}`);
}

/** Absolute URL for cross-portal / email deep links. */
export function commissionInvoiceDetailHref(
  portal: Extract<PortalId, "platform" | "agent">,
  payoutId: string,
): string {
  return portalHref(portal, `commissions/${encodeURIComponent(payoutId.trim())}`);
}

/** Deep-link to a platform commission invoice (detail when id known). */
export function paymentLinkForPlatformPayout(
  payoutIdOrPayee: string,
  periodKey?: string,
): string {
  if (!periodKey) {
    return commissionInvoiceDetailPath("platform", payoutIdOrPayee);
  }
  // Legacy payee+period — list page redirects to detail.
  return `${platformRoute("commissions")}?tab=invoices&payee=${encodeURIComponent(payoutIdOrPayee)}&period=${encodeURIComponent(periodKey)}`;
}

/** Agent-portal path for the payee to open / confirm an invoice. */
export function paymentLinkForAgentPayout(payoutId: string): string {
  return commissionInvoiceDetailPath("agent", payoutId);
}

/**
 * Remittance URI for commission payout slips (QR + copyable payment link).
 * Matches service-bill style: `tron:<addr>?amount=&asset=&network=` when Tron.
 */
export function commissionPayoutRemittanceUri(opts: {
  address: string;
  amount: number | string;
  asset?: string | null;
  network?: string | null;
}): string {
  const address = opts.address.trim();
  if (!address) return "";
  const asset = (opts.asset ?? "USDT").trim().toUpperCase() || "USDT";
  const network = (opts.network ?? "tron").trim().toLowerCase() || "tron";
  const amount = String(opts.amount).trim();
  if (network === "tron" || network === "tron_nile") {
    if (address.startsWith("T") && address.length >= 30) {
      const q = new URLSearchParams({ amount, asset, network });
      return `tron:${address}?${q.toString()}`;
    }
  }
  return address;
}

export function mergeStatementWithPayout(
  statement: CommissionStatementRow,
  payout: CommissionPayoutRecord | undefined,
): CommissionStatementRow {
  if (!payout) return statement;
  if (payout.payoutStatus === "settled" || payout.payoutStatus === "paid") {
    return { ...statement, payoutStatus: "paid" };
  }
  return statement;
}

export async function findPayout(
  payeeOrgId: string,
  periodKey: string,
  payer: "platform" = "platform",
): Promise<CommissionPayoutRecord | undefined> {
  const { items } = await listCommissionPayouts({
    payer,
    payeeOrgId,
    limit: 500,
  });
  return items.find(
    (r) =>
      r.payeeOrgId === payeeOrgId &&
      r.periodKey === periodKey &&
      r.payer === payer,
  );
}

/** Prior UTC calendar month YYYY-MM (matches day-C auto commission invoices). */
export function defaultCommissionPeriodKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}
