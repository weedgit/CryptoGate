import type { CommissionStatementRow } from "./commissionStatements";

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
  payoutStatus: "ready" | "paid";
  payoutAddress: string | null;
  asset: string | null;
  network: string | null;
  paymentLink: string;
  txRef: string | null;
  paidAt: string | null;
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

export async function upsertCommissionPayout(
  input: Omit<CommissionPayoutRecord, "id" | "updatedAt"> & { id?: string },
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

export async function markCommissionPayoutPaid(
  id: string,
  txRef: string,
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
      body: JSON.stringify({ txRef }),
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
  return `/platform/commissions?payee=${encodeURIComponent(payeeOrgId)}&period=${encodeURIComponent(periodKey)}`;
}

export function paymentLinkForAgentSubPayout(
  payeeOrgId: string,
  periodKey: string,
): string {
  return `/agent/commissions?payee=${encodeURIComponent(payeeOrgId)}&period=${encodeURIComponent(periodKey)}`;
}

export function mergeStatementWithPayout(
  statement: CommissionStatementRow,
  payout: CommissionPayoutRecord | undefined,
): CommissionStatementRow {
  if (!payout) return statement;
  return {
    ...statement,
    payoutStatus: payout.payoutStatus === "paid" ? "paid" : statement.payoutStatus,
  };
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
