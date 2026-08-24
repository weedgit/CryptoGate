import {
  ApiError,
  getSession,
  login,
  logout,
  listOrders,
  getMatchingMode,
  listSettlement,
  listXpub,
  type MatchingModeSettings,
  type PaymentOrder,
  type Session,
  type SettlementAddress,
  type XpubSettings,
} from "../merchant/api";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  "/v1";

export { ApiError, getSession, login, logout, listOrders, getMatchingMode, listSettlement, listXpub };
export type {
  PaymentOrder,
  Session,
  MatchingModeSettings,
  SettlementAddress,
  XpubSettings,
};

export type OrgAccount = {
  id: string;
  type: string;
  name: string;
  parentId: string | null;
  structure?: string | null;
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
  paidAt?: string | null;
  voidedAt?: string | null;
  lastAdjustmentReason?: string | null;
};

export type AuditLogEntry = {
  id: string;
  actorUserId: string | null;
  orgId: string | null;
  action: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type ServiceBillUpdateAction = "mark_paid" | "void" | "adjust";

async function parseError(res: Response): Promise<never> {
  const body = await res.text();
  try {
    const json = JSON.parse(body) as { code?: string; message?: string };
    throw new ApiError(
      json.code ?? "http_error",
      json.message ?? `HTTP ${res.status}`,
      res.status,
    );
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("http_error", body || `HTTP ${res.status}`, res.status);
  }
}

export async function listOrgs(): Promise<OrgAccount[]> {
  const res = await fetch(`${API_BASE}/orgs`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: OrgAccount[] };
  return data.items ?? [];
}

export async function listServiceBills(opts?: {
  status?: string;
  orgId?: string;
}): Promise<ServiceBill[]> {
  const q = new URLSearchParams();
  if (opts?.status) q.set("status", opts.status);
  if (opts?.orgId) q.set("orgId", opts.orgId);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await fetch(`${API_BASE}/service-bills${suffix}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: ServiceBill[] };
  return data.items ?? [];
}

export async function getServiceBill(billId: string): Promise<ServiceBill> {
  const res = await fetch(`${API_BASE}/service-bills/${encodeURIComponent(billId)}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ServiceBill;
}

export async function issueServiceBill(input: {
  orgId: string;
  periodStart: string;
  periodEnd: string;
  subscriptionAmount: string;
  volumeFeeAmount: string;
  dueAt: string;
}): Promise<ServiceBill> {
  const res = await fetch(`${API_BASE}/service-bills`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ServiceBill;
}

export async function createOrg(body: {
  type: string;
  name: string;
  parentId: string;
}): Promise<OrgAccount> {
  const res = await fetch(`${API_BASE}/orgs`, {
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

export async function inviteOrgUser(
  orgId: string,
  body: { email: string; role: string },
): Promise<{ orgId: string; userId: string; role: string; orgType: string }> {
  const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/users`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as {
    orgId: string;
    userId: string;
    role: string;
    orgType: string;
  };
}

export async function updateServiceBill(
  billId: string,
  body: {
    action: ServiceBillUpdateAction;
    reason?: string;
    adjustmentAmount?: string;
    paymentReference?: string;
  },
): Promise<ServiceBill> {
  const res = await fetch(
    `${API_BASE}/service-bills/${encodeURIComponent(billId)}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
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
  const res = await fetch(`${API_BASE}/audit${suffix}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: AuditLogEntry[] };
  return data.items ?? [];
}

export type FeeTierBand = {
  tier: string;
  subscriptionAmountUsd: string;
  volumeFeeMinPercent: string;
  volumeFeeMaxPercent: string;
  defaultSignupPercent: string;
  tierDescription?: string;
};

export type PlatformFeeTierSettings = {
  tiers: FeeTierBand[];
  updatedAt: string;
};

export type PlatformOrgPolicy = {
  maxAgentDepth: number;
};

export type EnterpriseRateApproval = {
  id: string;
  orgId: string;
  merchantName: string;
  requestedTier: string;
  requestedVolumeFeePercent: string;
  status: string;
  requestedByUserId: string;
  createdAt: string;
};

export async function getFeeTierSettings(): Promise<PlatformFeeTierSettings> {
  const res = await fetch(`${API_BASE}/platform/settings/fee-tiers`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PlatformFeeTierSettings;
}

export async function updateFeeTierSettings(body: {
  tiers: FeeTierBand[];
}): Promise<PlatformFeeTierSettings> {
  const res = await fetch(`${API_BASE}/platform/settings/fee-tiers`, {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PlatformFeeTierSettings;
}

export async function getPlatformOrgPolicy(): Promise<PlatformOrgPolicy> {
  const res = await fetch(`${API_BASE}/platform/settings/org-policy`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PlatformOrgPolicy;
}

export async function updatePlatformOrgPolicy(body: {
  maxAgentDepth: number;
}): Promise<PlatformOrgPolicy> {
  const res = await fetch(`${API_BASE}/platform/settings/org-policy`, {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PlatformOrgPolicy;
}

export async function listEnterpriseRateApprovals(opts?: {
  status?: string;
}): Promise<EnterpriseRateApproval[]> {
  const q = new URLSearchParams();
  if (opts?.status) q.set("status", opts.status);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await fetch(
    `${API_BASE}/platform/enterprise-rate-approvals${suffix}`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: EnterpriseRateApproval[] };
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

export async function getMerchantCommercial(
  orgId: string,
): Promise<MerchantCommercialSettings> {
  const res = await fetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/commercial`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as MerchantCommercialSettings;
}

export async function updateMerchantCommercial(
  orgId: string,
  body: { tier?: string; volumeFeePercent?: string; reason?: string },
): Promise<MerchantCommercialSettings> {
  const res = await fetch(
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

export async function decideEnterpriseRateApproval(
  approvalId: string,
  body: { decision: "approve" | "deny"; reason?: string },
): Promise<EnterpriseRateApproval> {
  const res = await fetch(
    `${API_BASE}/platform/enterprise-rate-approvals/${encodeURIComponent(approvalId)}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as EnterpriseRateApproval;
}
