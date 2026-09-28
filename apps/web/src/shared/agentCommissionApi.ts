import { apiFetch } from "../auth/apiFetch";
import { API_BASE, parseError } from "./apiCore";

export type AgentCommissionSettings = {
  orgId: string;
  commissionPercent: string;
  rateMode?: "automatic" | "fixed";
  effectiveFrom: string;
  updatedAt?: string;
};

export type FeeTierBand = {
  tier: string;
  subscriptionAmountUsd: string;
  volumeFeeMinPercent: string;
  volumeFeeMaxPercent: string;
  defaultSignupPercent: string;
  volumeMinUsd?: string;
  volumeMaxUsd?: string | null;
  agentCommissionPercent?: string;
  tierDescription?: string;
};

export type PlatformFeeTierSettings = {
  tiers: FeeTierBand[];
  updatedAt: string | null;
  pendingEffectiveFrom?: string | null;
};

export type AgentPayoutAddress = {
  orgId: string;
  asset: string;
  network: string;
  address: string;
  pendingAddress?: string | null;
  pendingActivatesAt?: string | null;
  updatedAt?: string;
};

export async function getAgentCommission(
  orgId: string,
): Promise<AgentCommissionSettings> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/agent-commission`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as AgentCommissionSettings;
}

/** Batch list — commissions board (avoids N× getAgentCommission). */
export async function listAgentCommissions(): Promise<AgentCommissionSettings[]> {
  const res = await apiFetch(`${API_BASE}/agent-commissions`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: AgentCommissionSettings[] };
  return data.items ?? [];
}

export async function getAgentPayout(
  orgId: string,
): Promise<AgentPayoutAddress | null> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/agent-payout`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) await parseError(res);
  return (await res.json()) as AgentPayoutAddress;
}

export async function putAgentPayout(
  orgId: string,
  body: { asset: string; network: string; address: string; mfaCode: string },
): Promise<AgentPayoutAddress> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/agent-payout`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as AgentPayoutAddress;
}

/** Batch list — commissions board (avoids N× getAgentPayout). */
export async function listAgentPayoutAddresses(): Promise<AgentPayoutAddress[]> {
  const res = await apiFetch(`${API_BASE}/agent-payout-addresses`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: AgentPayoutAddress[] };
  return data.items ?? [];
}

export async function getFeeTierSettings(): Promise<PlatformFeeTierSettings> {
  const res = await apiFetch(`${API_BASE}/platform/settings/fee-tiers`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PlatformFeeTierSettings;
}
