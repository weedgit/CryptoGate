import { apiFetch } from "../auth/apiFetch";
import {
  ApiError,
  getSession,
  login,
  logout,
  listOrders,
  listOrgUsers,
  listOrgMemberEmails,
  setOrgUserStatus,
  removeOrgUser,
  inviteOrgUser,
  assignOrgUserRole,
  type OrgMember,
  type InviteOrgUserResult,
  type PaymentOrder,
  type Session,
} from "../merchant/api";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  "/v1";

export {
  ApiError,
  getSession,
  login,
  logout,
  listOrders,
  listOrgUsers,
  listOrgMemberEmails,
  setOrgUserStatus,
  removeOrgUser,
  inviteOrgUser,
  assignOrgUserRole,
};
export type { PaymentOrder, Session, OrgMember, InviteOrgUserResult };

export {
  invalidateAgentOrgList,
  peekAgentOrgs,
  getAgentOrgs,
  refreshAgentOrgList,
  mergeAgentOrg,
  removeAgentOrgFromList,
  AGENT_ORGS_UPDATED_EVENT,
} from "./agentOrgList";

export type OrgAccount = {
  id: string;
  type: string;
  name: string;
  parentId: string | null;
  structure?: string | null;
  status?: "active" | "paused";
  country?: string | null;
  legalName?: string | null;
  createdAt?: string;
  orderCreateSuspended?: boolean;
};

export type ServiceBill = {
  id: string;
  orgId: string;
  periodStart: string;
  periodEnd: string;
  subscriptionAmount: string;
  volumeFeeAmount: string;
  totalAmount: string;
  currency: string;
  status: string;
  dueAt: string;
  tier?: string | null;
  volumeFeePercent?: string | null;
  billedVolumeUsd?: string | null;
  paidAt?: string | null;
  voidedAt?: string | null;
  lastAdjustmentReason?: string | null;
  lastAdjustmentAmount?: string | null;
  paymentReference?: string | null;
  rxAddress?: string | null;
  remittancePayTo?: string | null;
  invoiceSeller?: { name: string; email: string | null };
  txAddress?: string | null;
  createdAt?: string | null;
};

export type AuditLogEntry = {
  id: string;
  createdAt: string;
  actorUserId: string | null;
  orgId: string | null;
  action: string;
  metadata: Record<string, unknown>;
};

async function parseError(res: Response): Promise<never> {
  const body = await res.text();
  try {
    const json = JSON.parse(body) as { code?: string; message?: string };
    const raw = json.message?.trim() || "";
    const friendly =
      res.status >= 500
        ? "Something went wrong on the server. Please try again."
        : raw || `Request failed (${res.status})`;
    throw new ApiError(json.code ?? "http_error", friendly, res.status);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const friendly =
      res.status >= 500
        ? "Something went wrong on the server. Please try again."
        : body?.trim() || `Request failed (${res.status})`;
    throw new ApiError("http_error", friendly, res.status);
  }
}

export async function listOrgs(): Promise<OrgAccount[]> {
  const res = await apiFetch(`${API_BASE}/orgs`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: OrgAccount[] };
  return data.items ?? [];
}

export async function setOrgStatus(
  orgId: string,
  status: "active" | "paused",
  opts?: { reason?: string },
): Promise<OrgAccount> {
  const body: { status: "active" | "paused"; reason?: string } = { status };
  const reason = opts?.reason?.trim();
  if (reason) body.reason = reason;
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/status`, {
    method: "PUT",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as OrgAccount;
}

export type OrgDeletePreview = {
  rootOrgId: string;
  orgCount: number;
  childOrgCount: number;
  memberCount: number;
  orderCount: number;
  billCount: number;
  orgs: Array<{ id: string; type: string; name: string; depth: number }>;
};

export async function getOrgDeletePreview(orgId: string): Promise<OrgDeletePreview> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/delete-preview`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as OrgDeletePreview;
}

export async function deleteOrg(
  orgId: string,
  opts?: { cascade?: boolean },
): Promise<void> {
  const q = opts?.cascade ? "?cascade=1" : "";
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}${q}`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
}

export async function listServiceBills(opts?: {
  status?: string;
  orgId?: string;
}): Promise<ServiceBill[]> {
  const q = new URLSearchParams();
  if (opts?.status) q.set("status", opts.status);
  if (opts?.orgId) q.set("orgId", opts.orgId);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await apiFetch(`${API_BASE}/service-bills${suffix}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: ServiceBill[] };
  return data.items ?? [];
}

export async function getAgentCommission(
  orgId: string,
): Promise<{ orgId: string; commissionPercent: string }> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/agent-commission`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as { orgId: string; commissionPercent: string };
}

export async function listAgentCommissions(): Promise<
  { orgId: string; commissionPercent: string }[]
> {
  const res = await apiFetch(`${API_BASE}/agent-commissions`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as {
    items: { orgId: string; commissionPercent: string }[];
  };
  return data.items ?? [];
}

export type AgentPayoutAddress = {
  orgId: string;
  asset: string;
  network: string;
  address: string;
  pendingAddress?: string | null;
  pendingActivatesAt?: string | null;
  updatedAt?: string;
};

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

export async function listAgentPayoutAddresses(): Promise<AgentPayoutAddress[]> {
  const res = await apiFetch(`${API_BASE}/agent-payout-addresses`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: AgentPayoutAddress[] };
  return data.items ?? [];
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

export async function getServiceBill(billId: string): Promise<ServiceBill> {
  const res = await apiFetch(`${API_BASE}/service-bills/${encodeURIComponent(billId)}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ServiceBill;
}

export async function listAuditLog(opts?: {
  from?: string;
  to?: string;
  actorUserId?: string;
  orgId?: string;
  action?: string;
  limit?: number;
}): Promise<AuditLogEntry[]> {
  const q = new URLSearchParams();
  if (opts?.from) q.set("from", opts.from);
  if (opts?.to) q.set("to", opts.to);
  if (opts?.actorUserId) q.set("actorUserId", opts.actorUserId);
  if (opts?.orgId) q.set("orgId", opts.orgId);
  if (opts?.action) q.set("action", opts.action);
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  const suffix = q.toString() ? `?${q}` : "";
  const res = await apiFetch(`${API_BASE}/audit${suffix}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: AuditLogEntry[] };
  return data.items ?? [];
}

export type MerchantCommercialSettings = {
  orgId: string;
  tier: string;
  volumeFeePercent: string;
  pendingVolumeFeePercent?: string | null;
  subscriptionAmountUsd: string;
  bandMinPercent: string;
  bandMaxPercent: string;
  effectiveFrom: string;
  enterpriseApprovalStatus?: "pending" | "approved" | "denied" | null;
};

export type FeeTierBand = {
  tier: string;
  subscriptionAmountUsd: string;
  volumeFeeMinPercent: string;
  volumeFeeMaxPercent: string;
  defaultSignupPercent: string;
  tierDescription?: string;
};

export async function getFeeTierSettings(): Promise<{
  tiers: FeeTierBand[];
  updatedAt: string;
}> {
  const res = await apiFetch(`${API_BASE}/platform/settings/fee-tiers`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as { tiers: FeeTierBand[]; updatedAt: string };
}

export async function getMerchantCommercial(
  orgId: string,
): Promise<MerchantCommercialSettings> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/commercial`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as MerchantCommercialSettings;
}

export async function listMerchantCommercialSummaries(
  orgIds: string[],
): Promise<MerchantCommercialSettings[]> {
  if (orgIds.length === 0) return [];
  const q = new URLSearchParams({ ids: orgIds.join(",") });
  const res = await apiFetch(`${API_BASE}/orgs/commercial-summaries?${q}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: MerchantCommercialSettings[] };
  return data.items ?? [];
}

export { getOrderSummary, type OrderSummary } from "../merchant/api";

export async function updateMerchantCommercial(
  orgId: string,
  body: { tier?: string; volumeFeePercent?: string; reason?: string },
): Promise<MerchantCommercialSettings> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/commercial`,
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
  return (await res.json()) as MerchantCommercialSettings;
}

export async function createOrg(body: {
  type: string;
  name: string;
  parentId: string;
  structure?: string;
  country?: string;
  legalName?: string;
  commercial?: { tier: string; volumeFeePercent: string };
  commissionPercent?: string;
}): Promise<OrgAccount> {
  const res = await apiFetch(`${API_BASE}/orgs`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as OrgAccount;
}
