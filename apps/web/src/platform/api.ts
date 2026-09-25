import { apiFetch } from "../auth/apiFetch";
import {
  ApiError,
  getSession,
  login,
  logout,
  listOrders,
  getOrderSummary,
  getMatchingMode,
  listOrgUsers,
  listOrgMemberEmails,
  assignOrgUserRole,
  setOrgUserStatus,
  removeOrgUser,
  inviteOrgUser,
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
  getOrderSummary,
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
  /** When paused for unpaid service bill. */
  statusReason?: string | null;
  statusReasonBillId?: string | null;
  orderCreateSuspended?: boolean;
  country?: string | null;
  legalName?: string | null;
  billingEmail?: string | null;
  iconKey?: string | null;
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
  billKind?: string | null;
  sentAt?: string | null;
  cancelledAt?: string | null;
  opsNote?: string | null;
  creditAppliedUsd?: string | null;
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
  invoiceSeller?: { name: string; email: string | null; phone?: string | null };
  txAddress?: string | null;
  createdAt?: string | null;
};

export type AuditLogEntry = {
  id: string;
  actorUserId: string | null;
  actorEmail?: string | null;
  actorDisplayName?: string | null;
  actorAvatarUrl?: string | null;
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
  /** Active cashier memberships on this org (merchant / site). */
  cashierCount?: number;
};

export async function listPlatformOrgMemberEmails(opts?: {
  types?: string[];
}): Promise<PlatformOrgMemberEmailRow[]> {
  const q = new URLSearchParams();
  if (opts?.types?.length) q.set("types", opts.types.join(","));
  const suffix = q.toString() ? `?${q}` : "";
  const res = await apiFetch(`${API_BASE}/platform/org-member-emails${suffix}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: PlatformOrgMemberEmailRow[] };
  return data.items ?? [];
}

/** Alias for listPlatformOrgMemberEmails (same bulk index). */
export const listPlatformOrgEmails = listPlatformOrgMemberEmails;

export type OrgPrimaryOwnerContact = {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  phone: string | null;
  timezone: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  avatarUrl?: string | null;
  mfaEnrolled?: boolean;
};

/** Team rows already include MFA. Use that until the owner contact payload does too. */
export function ownerContactWithMfa(
  contact: OrgPrimaryOwnerContact,
  team: { userId: string; role: string; mfaEnrolled?: boolean }[],
): OrgPrimaryOwnerContact {
  if (typeof contact.mfaEnrolled === "boolean") return contact;
  const row =
    team.find((m) => m.userId === contact.userId) ??
    team.find((m) => m.role === "owner");
  return { ...contact, mfaEnrolled: row?.mfaEnrolled === true };
}

export type OrgOverview = {
  team: OrgMember[];
  audit: AuditLogEntry[];
  orders: PaymentOrder[];
  commercial: MerchantCommercialSettings | null;
  payout: AgentPayoutAddress | null;
  commission: AgentCommissionSettings | null;
  primaryOwnerContact?: OrgPrimaryOwnerContact | null;
};

export async function getOrgOverview(orgId: string): Promise<OrgOverview> {
  const res = await apiFetch(
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
  getPlatformOrders,
  invalidatePlatformOrdersList,
  peekPlatformOrders,
} from "./platformOrdersList";
export {
  getPlatformOrgs,
  invalidatePlatformOrgList,
  peekPlatformOrgs,
  refreshPlatformOrgList,
  mergePlatformOrg,
  removePlatformOrgFromList,
  PLATFORM_ORGS_UPDATED_EVENT,
} from "./platformOrgList";
export {
  getPlatformServiceBills,
  invalidatePlatformServiceBillsList,
  peekPlatformServiceBills,
} from "./platformServiceBillsList";

export type ServiceBillUpdateAction =
  | "send"
  | "cancel"
  | "mark_paid"
  | "void"
  | "adjust"
  | "grant_credit";

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

export async function patchOrgProfile(
  orgId: string,
  body: {
    name: string;
    iconKey?: string | null;
    country?: string;
    legalName?: string | null;
    billingEmail?: string | null;
  },
): Promise<OrgAccount> {
  const payload: Record<string, unknown> = {
    name: body.name.trim(),
    iconKey: body.iconKey ?? null,
  };
  if (body.country !== undefined) payload.country = body.country;
  if (body.legalName !== undefined) payload.legalName = body.legalName;
  if (body.billingEmail !== undefined) payload.billingEmail = body.billingEmail;
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as OrgAccount;
}

/** Platform Owner only — edit org Owner person profile. */
export async function patchOrgOwnerProfile(
  orgId: string,
  body: {
    firstName?: string | null;
    lastName?: string | null;
    timezone?: string;
    email?: string;
    phone?: string | null;
    avatarUrl?: string | null;
    password?: string;
  },
): Promise<OrgPrimaryOwnerContact> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/owner-profile`,
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
  return (await res.json()) as OrgPrimaryOwnerContact;
}

/** Platform Owner or Administrator — edit a team member's contact, avatar, and role. */
export async function patchOrgMember(
  orgId: string,
  userId: string,
  body: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
    phone?: string | null;
    timezone?: string;
    avatarUrl?: string | null;
    role?: string;
    emailVerified?: boolean;
    phoneVerified?: boolean;
    password?: string;
  },
): Promise<OrgMember> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`,
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
  return (await res.json()) as OrgMember;
}

/** Platform Owner only — override Owner email/phone verification. */
export async function putOrgOwnerVerification(
  orgId: string,
  body: { emailVerified?: boolean; phoneVerified?: boolean },
): Promise<OrgPrimaryOwnerContact> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/owner-verification`,
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
  return (await res.json()) as OrgPrimaryOwnerContact;
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

/** Platform agent detail needs the full load-test bill set (not the API default 100). */
export const SERVICE_BILLS_LIST_LIMIT = 5000;

export type ServiceBillListPage = {
  items: ServiceBill[];
  total: number;
  limit: number;
  offset: number;
};

export async function listServiceBillsPage(opts?: {
  status?: string;
  orgId?: string;
  limit?: number;
  offset?: number;
}): Promise<ServiceBillListPage> {
  const q = new URLSearchParams();
  if (opts?.status) q.set("status", opts.status);
  if (opts?.orgId) q.set("orgId", opts.orgId);
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  if (opts?.offset != null) q.set("offset", String(opts.offset));
  const suffix = q.toString() ? `?${q}` : "";
  const res = await apiFetch(`${API_BASE}/service-bills${suffix}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as {
    items: ServiceBill[];
    total?: number;
    limit?: number;
    offset?: number;
  };
  const items = data.items ?? [];
  return {
    items,
    total: data.total ?? items.length,
    limit: data.limit ?? opts?.limit ?? 100,
    offset: data.offset ?? opts?.offset ?? 0,
  };
}

export async function listServiceBills(opts?: {
  status?: string;
  orgId?: string;
  limit?: number;
  offset?: number;
}): Promise<ServiceBill[]> {
  const page = await listServiceBillsPage(opts);
  return page.items;
}

export async function getServiceBill(billId: string): Promise<ServiceBill> {
  const res = await apiFetch(`${API_BASE}/service-bills/${encodeURIComponent(billId)}`, {
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
  /** @deprecated Ignored — server sets due from pay-within days. */
  dueAt?: string;
}): Promise<ServiceBill> {
  const res = await apiFetch(`${API_BASE}/service-bills`, {
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

export type GenerateServiceBillsSkip = {
  orgId: string;
  reason: string;
};

export type GenerateServiceBillsResult = {
  periodStart: string;
  periodEnd: string;
  issued: ServiceBill[];
  skipped: GenerateServiceBillsSkip[];
};

/** Platform O/A — batch issue from completed volume + fee tiers (X-02). */
export async function generateServiceBills(input?: {
  periodStart?: string;
  periodEnd?: string;
}): Promise<GenerateServiceBillsResult> {
  const res = await apiFetch(`${API_BASE}/service-bills/generate`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input ?? {}),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as GenerateServiceBillsResult;
}

export async function createOrg(body: {
  type: string;
  name: string;
  parentId: string;
  country?: string;
  legalName?: string;
  commissionPercent?: string;
  commercial?: { tier: string; volumeFeePercent: string };
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

export async function updateServiceBill(
  billId: string,
  body: {
    action: ServiceBillUpdateAction;
    reason?: string;
    adjustmentAmount?: string;
    subscriptionAmount?: string;
    volumeFeeAmount?: string;
    creditAmount?: string;
    opsNote?: string;
    paymentReference?: string;
    rxAddress?: string;
    txAddress?: string;
  },
): Promise<ServiceBill> {
  const res = await apiFetch(
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
  const res = await apiFetch(`${API_BASE}/audit${suffix}`, {
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
  volumeMinUsd?: string;
  volumeMaxUsd?: string | null;
  agentCommissionPercent?: string;
  tierDescription?: string;
};

export type FeeTierEffectiveTiming = "immediate" | "next_billing_cycle";

export type PlatformFeeTierSettings = {
  tiers: FeeTierBand[];
  updatedAt: string | null;
  pendingEffectiveFrom?: string | null;
};

export type PlatformOrgPolicy = {
  maxAgentDepth: number;
  mfaEnforcement: boolean;
  sessionTimeoutMinutes: number;
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
  const res = await apiFetch(`${API_BASE}/platform/settings/fee-tiers`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PlatformFeeTierSettings;
}

export async function updateFeeTierSettings(body: {
  tiers: FeeTierBand[];
  effectiveTiming?: FeeTierEffectiveTiming;
}): Promise<PlatformFeeTierSettings> {
  const res = await apiFetch(`${API_BASE}/platform/settings/fee-tiers`, {
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
  const res = await apiFetch(`${API_BASE}/platform/settings/org-policy`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PlatformOrgPolicy;
}

export async function updatePlatformOrgPolicy(body: {
  maxAgentDepth: number;
  mfaEnforcement: boolean;
  sessionTimeoutMinutes: number;
}): Promise<PlatformOrgPolicy> {
  const res = await apiFetch(`${API_BASE}/platform/settings/org-policy`, {
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

export type PlatformBillingWalletSettings = {
  sellerName: string;
  /** Invoice contact email (billing settings), with Owner email fallback. */
  sellerEmail: string | null;
  payTo: string | null;
  updatedAt: string;
};

export async function getBillingWalletSettings(): Promise<PlatformBillingWalletSettings> {
  const res = await apiFetch(`${API_BASE}/platform/settings/billing-wallet`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PlatformBillingWalletSettings;
}

export async function updateBillingWalletSettings(body: {
  sellerName: string;
  sellerEmail?: string | null;
  payTo?: string | null;
}): Promise<PlatformBillingWalletSettings> {
  const res = await apiFetch(`${API_BASE}/platform/settings/billing-wallet`, {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PlatformBillingWalletSettings;
}

export type BillingCalendarSettings = {
  merchantPayDayStart: number;
  merchantPayDayEnd: number;
  agentPayDayStart: number;
  agentPayDayEnd: number;
  activationFeeUsd: string;
  activationPayDays: number;
  autoSendInvoices: boolean;
  updatedAt: string;
};

export async function getBillingCalendarSettings(): Promise<BillingCalendarSettings> {
  const res = await apiFetch(`${API_BASE}/platform/settings/billing-calendar`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as BillingCalendarSettings;
}

export async function updateBillingCalendarSettings(body: {
  merchantPayDayStart: number;
  merchantPayDayEnd: number;
  agentPayDayStart: number;
  agentPayDayEnd: number;
  activationFeeUsd: string;
  activationPayDays: number;
  autoSendInvoices: boolean;
}): Promise<BillingCalendarSettings> {
  const res = await apiFetch(`${API_BASE}/platform/settings/billing-calendar`, {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as BillingCalendarSettings;
}

export type PlatformDashboardSummary = {
  orders: import("../merchant/api").OrderSummary;
  signups: { newMerchants: number; newAgents: number; newCashiers: number };
};

export async function getPlatformDashboardSummary(
  from: string,
  to: string,
): Promise<PlatformDashboardSummary> {
  const q = new URLSearchParams({ from, to });
  const res = await apiFetch(
    `${API_BASE}/platform/dashboard-summary?${q}`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as PlatformDashboardSummary;
}

export async function listEnterpriseRateApprovals(opts?: {
  status?: string;
}): Promise<EnterpriseRateApproval[]> {
  const q = new URLSearchParams();
  if (opts?.status) q.set("status", opts.status);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await apiFetch(
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
  const res = await apiFetch(`${API_BASE}/platform/watcher-health`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as WatcherHealthList;
}

export type BackupStatus = {
  status: "ok" | "failed" | "stale" | "unknown";
  detail: string;
  lastAt: string | null;
  ageHours: number | null;
  staleAfterHours: number;
  bytes: number | null;
  offsite: boolean | null;
  errors: number | null;
  message: string | null;
  checkedAt?: string;
};

export async function getBackupStatus(): Promise<BackupStatus> {
  const res = await apiFetch(`${API_BASE}/platform/backup-status`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as BackupStatus;
}

export type NetworkOrderabilityLamp = {
  code: "open" | "paused" | "down" | "off" | "checking";
  label: string;
  tone: "ok" | "warn" | "bad" | "muted";
};

export type NetworkCatalogIngestStatus =
  | "live"
  | "stub"
  | "degraded"
  | "down"
  | "unknown";

export type NetworkCatalogCard = {
  network: string;
  title: string;
  status: "active" | "maintenance" | "catalogued";
  lamp: NetworkOrderabilityLamp;
  pairCount: number;
  enabledCount: number;
  catalogFraction: number;
  primaryAsset: string | null;
  confirmations: number | null;
  minAmount: string | null;
  contractAddress: string | null;
  pairs: {
    asset: string;
    enabled: boolean;
    contractAddress: string | null;
    decimals: number;
    minAmount: string;
    requiredConfirmations: number;
    displayNetwork: string;
    lamp: NetworkOrderabilityLamp;
  }[];
  maintenance: {
    active: boolean;
    message: string | null;
    startedAt: string | null;
    endsAt: string | null;
    updatedAt: string | null;
  };
  ingest: {
    ingestStatus: NetworkCatalogIngestStatus | string;
    ingestLabel: string;
    rpcConfigured: boolean;
    rpcMode: string | null;
    healthScore: number | null;
    lagMs: number | null;
    tickAt: string | null;
    openOrders: number;
  };
};

export type NetworkCatalog = {
  chainEnv: string;
  checkedAt: string;
  items: NetworkCatalogCard[];
};

export type NetworksStatus = {
  chainEnv: string;
  checkedAt: string;
  items: {
    network: string;
    title: string;
    lamp: NetworkOrderabilityLamp;
    maintenance: { active: boolean; message: string | null };
    ingestStatus: NetworkCatalogIngestStatus | string;
    pairs: {
      asset: string;
      enabled: boolean;
      lamp: NetworkOrderabilityLamp;
      displayNetwork: string;
    }[];
  }[];
};

export async function getNetworkCatalog(): Promise<NetworkCatalog> {
  const res = await apiFetch(`${API_BASE}/platform/networks/catalog`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as NetworkCatalog;
}

export async function getNetworksStatus(): Promise<NetworksStatus> {
  const res = await apiFetch(`${API_BASE}/networks/status`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as NetworksStatus;
}

export async function putNetworkMaintenance(
  network: string,
  body: { active: boolean; message?: string | null; endsAt?: string | null },
): Promise<{
  network: string;
  active: boolean;
  message: string | null;
  startedAt: string | null;
  endsAt: string | null;
  updatedAt: string;
}> {
  const res = await apiFetch(
    `${API_BASE}/platform/networks/${encodeURIComponent(network)}/maintenance`,
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
  return (await res.json()) as {
    network: string;
    active: boolean;
    message: string | null;
    startedAt: string | null;
    endsAt: string | null;
    updatedAt: string;
  };
}

export type ActiveNetworkMaintenance = {
  network: string;
  message: string | null;
  startedAt: string | null;
  endsAt: string | null;
};

export async function listActiveNetworkMaintenance(): Promise<{
  items: ActiveNetworkMaintenance[];
  checkedAt: string;
}> {
  const res = await apiFetch(`${API_BASE}/network-maintenance`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as {
    items: ActiveNetworkMaintenance[];
    checkedAt: string;
  };
}

export type MerchantCommercialSettings = {
  orgId: string;
  tier: string;
  volumeFeePercent: string;
  rateMode?: "automatic" | "fixed";
  pendingVolumeFeePercent?: string | null;
  subscriptionAmountUsd: string;
  bandMinPercent: string;
  bandMaxPercent: string;
  effectiveFrom: string;
  enterpriseApprovalStatus?: "pending" | "approved" | "denied" | null;
  feeExemptUntil?: string | null;
  skipActivation?: boolean;
  billingOpsNote?: string | null;
  serviceBillCreditUsd?: string;
  billingAnchorAt?: string | null;
  nextInvoiceOn?: string | null;
};

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

export async function updateMerchantCommercial(
  orgId: string,
  body: {
    tier?: string;
    volumeFeePercent?: string;
    rateMode?: "automatic" | "fixed";
    reason?: string;
    feeExemptUntil?: string | null;
    skipActivation?: boolean;
    billingOpsNote?: string | null;
    serviceBillCreditUsd?: string;
  },
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

export type AgentPayoutAddress = {
  orgId: string;
  asset: string;
  network: string;
  address: string;
  pendingAddress?: string | null;
  pendingActivatesAt?: string | null;
  updatedAt?: string;
};

export type AgentCommissionSettings = {
  orgId: string;
  commissionPercent: string;
  rateMode?: "automatic" | "fixed";
  effectiveFrom: string;
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

export async function putAgentCommission(
  orgId: string,
  body: {
    commissionPercent?: string;
    rateMode?: "automatic" | "fixed";
  },
): Promise<AgentCommissionSettings> {
  const res = await apiFetch(
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
  const res = await apiFetch(
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
  matchingMode?: "B" | "C" | "S";
  settlement?: { asset: string; network: string; address: string };
};

export async function listComplianceOverrides(
  orgId: string,
): Promise<{ items: ComplianceOverride[]; softEmpty?: boolean }> {
  const res = await apiFetch(
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
  const res = await apiFetch(
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
