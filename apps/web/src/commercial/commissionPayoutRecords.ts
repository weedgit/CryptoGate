import type { CommissionStatementRow } from "./commissionStatements";

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
  payer: "platform" | "agent";
  /** When payer is agent, the parent agent org id. */
  payerOrgId: string | null;
  periodKey: string;
  periodLabel: string;
  platformFeeCollected: number;
  commissionPercent: string;
  commissionAmount: number;
  payoutStatus: "issued" | "ready" | "verifying" | "paid" | "settled";
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
  payer?: "platform" | "agent";
  payeeOrgId?: string;
  payerOrgId?: string;
}): Promise<CommissionPayoutRecord[]> {
  const q = new URLSearchParams();
  if (filter?.payer) q.set("payer", filter.payer);
  if (filter?.payeeOrgId) q.set("payeeOrgId", filter.payeeOrgId);
  if (filter?.payerOrgId) q.set("payerOrgId", filter.payerOrgId);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await fetch(`${API_BASE}/commission-payouts${suffix}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: CommissionPayoutRecord[] };
  const rows = data.items ?? [];
  return rows.sort((a, b) => {
    const p = b.periodKey.localeCompare(a.periodKey);
    if (p !== 0) return p;
    return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  });
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

export async function upsertCommissionPayout(
  input: Omit<CommissionPayoutRecord, "id" | "updatedAt" | "treeSnapshot" | "settledAt" | "agentConfirmedBy"> & {
    id?: string;
  },
): Promise<CommissionPayoutRecord> {
  const res = await fetch(`${API_BASE}/commission-payouts`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payeeOrgId: input.payeeOrgId,
      payeeName: input.payeeName,
      payer: input.payer,
      payerOrgId: input.payerOrgId,
      periodKey: input.periodKey,
      periodLabel: input.periodLabel,
      platformFeeCollected: input.platformFeeCollected,
      commissionPercent: input.commissionPercent,
      commissionAmount: input.commissionAmount,
      payoutAddress: input.payoutAddress,
      asset: input.asset,
      network: input.network,
      paymentLink: input.paymentLink,
    }),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as CommissionPayoutRecord;
}

export async function confirmCommissionPayoutSent(
  id: string,
  opts?: { note?: string | null },
): Promise<CommissionPayoutRecord | null> {
  const res = await fetch(
    `${API_BASE}/commission-payouts/${encodeURIComponent(id)}/confirm-sent`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        note: opts?.note?.trim() || null,
      }),
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

export function paymentLinkForPlatformPayout(
  payeeOrgId: string,
  periodKey: string,
): string {
  return `/platform/commissions?tab=invoices&payee=${encodeURIComponent(payeeOrgId)}&period=${encodeURIComponent(periodKey)}`;
}

export function paymentLinkForAgentSubPayout(
  payeeOrgId: string,
  periodKey: string,
): string {
  return `/agent/commissions?payee=${encodeURIComponent(payeeOrgId)}&period=${encodeURIComponent(periodKey)}`;
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
  if (network === "tron" && address.startsWith("T") && address.length >= 30) {
    const q = new URLSearchParams({ amount, asset, network });
    return `tron:${address}?${q.toString()}`;
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
  payer: "platform" | "agent",
): Promise<CommissionPayoutRecord | undefined> {
  const rows = await listCommissionPayouts({ payer, payeeOrgId });
  return rows.find(
    (r) =>
      r.payeeOrgId === payeeOrgId &&
      r.periodKey === periodKey &&
      r.payer === payer,
  );
}

/** Current UTC calendar month YYYY-MM. */
export function defaultCommissionPeriodKey(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}
