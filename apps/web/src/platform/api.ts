import {
  ApiError,
  getSession,
  login,
  logout,
  listOrders,
  listOrgUsers,
  listOrgMemberEmails,
  assignOrgUserRole,
  setOrgUserStatus,
  removeOrgUser,
  inviteOrgUser,
  getMatchingMode,
  listSettlement,
  listXpub,
  type MatchingModeSettings,
  type OrgMember,
  type InviteOrgUserResult,
  type PaymentOrder,
  type Session,
  type SettlementAddress,
  type XpubSettings,
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
  getMatchingMode,
  listSettlement,
  listXpub,
  listOrgUsers,
  listOrgMemberEmails,
  assignOrgUserRole,
  setOrgUserStatus,
  removeOrgUser,
  inviteOrgUser,
};
export type {
  PaymentOrder,
  Session,
  MatchingModeSettings,
  SettlementAddress,
  XpubSettings,
  OrgMember,
  InviteOrgUserResult,
};

export type OrgAccount = {
  id: string;
  type: string;
  name: string;
  parentId: string | null;
  status?: "active" | "paused";
  orderCreateSuspended?: boolean;
  structure?: string | null;
  country?: string | null;
  billingEmail?: string | null;
  legalName?: string | null;
  createdAt?: string;
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

export type PlatformOrgMemberEmailRow = {
  orgId: string;
  emails: string[];
  /** Preferred Owner-role email when present. */
  ownerEmail?: string | null;
};

export async function listPlatformOrgMemberEmails(opts?: {
  types?: string[];
}): Promise<PlatformOrgMemberEmailRow[]> {
  const q = new URLSearchParams();
  if (opts?.types?.length) q.set("types", opts.types.join(","));
  const suffix = q.toString() ? `?${q}` : "";
  const res = await fetch(`${API_BASE}/platform/org-member-emails${suffix}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: PlatformOrgMemberEmailRow[] };
  return data.items ?? [];
}

/** Alias for listPlatformOrgMemberEmails (same bulk index). */
export const listPlatformOrgEmails = listPlatformOrgMemberEmails;

export type OrgOverview = {
  team: OrgMember[];
  audit: AuditLogEntry[];
  orders: PaymentOrder[];
  commercial: MerchantCommercialSettings | null;
  payout: AgentPayoutAddress | null;
  commission: AgentCommissionSettings | null;
};

export async function getOrgOverview(orgId: string): Promise<OrgOverview> {
  const res = await fetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/overview`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as OrgOverview;
}

export {
  getPlatformOrgs,
  invalidatePlatformOrgList,
  peekPlatformOrgs,
} from "./platformOrgList";
export {
  getPlatformServiceBills,
  invalidatePlatformServiceBillsList,
  peekPlatformServiceBills,
} from "./platformServiceBillsList";

export type ServiceBillUpdateAction = "mark_paid" | "void" | "adjust";

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
  const res = await fetch(`${API_BASE}/orgs`, {
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
  const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/status`, {
    method: "PUT",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as OrgAccount;
}

export async function deleteOrg(orgId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
}

/** Platform agent detail needs the full load-test bill set (not the API default 100). */
export const SERVICE_BILLS_LIST_LIMIT = 5000;

export async function listServiceBills(opts?: {
  status?: string;
  orgId?: string;
  limit?: number;
}): Promise<ServiceBill[]> {
  const q = new URLSearchParams();
  if (opts?.status) q.set("status", opts.status);
  if (opts?.orgId) q.set("orgId", opts.orgId);
  if (opts?.limit != null) q.set("limit", String(opts.limit));
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
  structure?: string;
  country?: string;
  billingEmail?: string;
  billingContact?: string;
  legalName?: string;
  commissionPercent?: string;
  commercial?: { tier: string; volumeFeePercent: string };
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

export type WatcherHealthStatus = "ok" | "degraded" | "down" | "unknown";

export type WatcherHeartbeat = {
  network: string;
  asset: string;
  tick: number;
  status: WatcherHealthStatus | string;
  healthScore: number;
  rpcOk: boolean;
  rpcMode: string;
  ingestMode: string;
  pollIntervalMs: number;
  openOrders: number;
  awaitingConfirmations: number;
  transfersSeen: number;
  lastError?: string | null;
  detail?: Record<string, unknown>;
  tickAt: string;
  updatedAt: string;
  lagMs: number;
};

export type WatcherHealthList = {
  items: WatcherHeartbeat[];
  checkedAt: string;
  note?: string;
};

export async function getWatcherHealth(): Promise<WatcherHealthList> {
  const res = await fetch(`${API_BASE}/platform/watcher-health`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as WatcherHealthList;
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

export type AgentPayoutAddress = {
  orgId: string;
  asset: string;
  network: string;
  address: string;
  updatedAt?: string;
};

export type AgentCommissionSettings = {
  orgId: string;
  commissionPercent: string;
  effectiveFrom: string;
  updatedAt?: string;
};

export async function getAgentPayout(
  orgId: string,
): Promise<AgentPayoutAddress | null> {
  const res = await fetch(
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
  body: { asset: string; network: string; address: string },
): Promise<AgentPayoutAddress> {
  const res = await fetch(
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

export async function getAgentCommission(
  orgId: string,
): Promise<AgentCommissionSettings> {
  const res = await fetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/agent-commission`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as AgentCommissionSettings;
}

export async function putAgentCommission(
  orgId: string,
  body: { commissionPercent: string },
): Promise<AgentCommissionSettings> {
  const res = await fetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/agent-commission`,
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
  return (await res.json()) as AgentCommissionSettings;
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

export type ComplianceOverrideType =
  | "settlement_address"
  | "matching_mode"
  | "suspend_order_create"
  | "suspend_merchant";

export type ComplianceReasonCode =
  | "manual_review"
  | "suspicious_activity"
  | "sanctions_screening"
  | "other";

export type ComplianceOverride = {
  id: string;
  orgId: string;
  actorUserId: string;
  overrideType: ComplianceOverrideType;
  reasonCode: ComplianceReasonCode;
  notes: string;
  ticketId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type ComplianceOverrideRequest = {
  overrideType: ComplianceOverrideType;
  reasonCode: ComplianceReasonCode;
  notes: string;
  ticketId?: string;
  mfaCode: string;
  matchingMode?: "B" | "C" | "D" | "S";
  settlement?: { asset: string; network: string; address: string };
};

export async function listComplianceOverrides(
  orgId: string,
): Promise<{ items: ComplianceOverride[]; softEmpty?: boolean }> {
  const res = await fetch(
    `${API_BASE}/platform/orgs/${encodeURIComponent(orgId)}/compliance-overrides`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as {
    items: ComplianceOverride[];
    softEmpty?: boolean;
  };
}

export async function applyComplianceOverride(
  orgId: string,
  body: ComplianceOverrideRequest,
): Promise<{ override: ComplianceOverride; org?: OrgAccount }> {
  const res = await fetch(
    `${API_BASE}/platform/orgs/${encodeURIComponent(orgId)}/compliance-override`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as {
    override: ComplianceOverride;
    org?: OrgAccount;
  };
}
