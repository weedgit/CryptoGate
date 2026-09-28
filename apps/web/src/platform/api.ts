import { apiFetch } from "../auth/apiFetch";
import { API_BASE, parseError } from "../shared/apiCore";
import {
  listOrgs,
  setOrgStatus,
  patchOrgProfile,
  deleteOrg,
  getOrgDeletePreview,
  createOrg,
  getMerchantCommercial,
  updateMerchantCommercial,
} from "../shared/orgApi";
import type {
  OrgAccount,
  OrgDeletePreview,
  MerchantCommercialSettings,
} from "../shared/orgApi";
import {
  SERVICE_BILLS_LIST_LIMIT,
  listServiceBillsPage,
  listServiceBills,
  getServiceBill,
} from "../shared/serviceBillApi";
import type { ServiceBill, ServiceBillListPage } from "../shared/serviceBillApi";
import { listAuditLog } from "../shared/auditApi";
import type { AuditLogEntry } from "../shared/auditApi";
import {
  getFeeTierSettings,
  getAgentPayout,
  listAgentPayoutAddresses,
  putAgentPayout,
  getAgentCommission,
  listAgentCommissions,
} from "../shared/agentCommissionApi";
import type {
  FeeTierBand,
  PlatformFeeTierSettings,
  AgentPayoutAddress,
  AgentCommissionSettings,
} from "../shared/agentCommissionApi";
import {
  getNetworksStatus,
  getMerchantNetworkRails,
  putMerchantNetworkRailSettings,
  listActiveNetworkMaintenance,
} from "../shared/networkApi";
import type {
  NetworkOrderabilityLamp,
  NetworksStatus,
  MerchantNetworkRailItem,
  ActiveNetworkMaintenance,
} from "../shared/networkApi";
import {
  ApiError,
  getSession,
  login,
  logout,
  listOrders,
  listOrdersPage,
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

export {
  listOrgs,
  setOrgStatus,
  patchOrgProfile,
  deleteOrg,
  getOrgDeletePreview,
  createOrg,
  getMerchantCommercial,
  updateMerchantCommercial,
};
export type { OrgAccount, OrgDeletePreview, MerchantCommercialSettings };
export {
  SERVICE_BILLS_LIST_LIMIT,
  listServiceBillsPage,
  listServiceBills,
  getServiceBill,
};
export type { ServiceBill, ServiceBillListPage };
export { listAuditLog };
export type { AuditLogEntry };
export {
  getFeeTierSettings,
  getAgentPayout,
  listAgentPayoutAddresses,
  putAgentPayout,
  getAgentCommission,
  listAgentCommissions,
};
export type {
  FeeTierBand,
  PlatformFeeTierSettings,
  AgentPayoutAddress,
  AgentCommissionSettings,
};
export {
  getNetworksStatus,
  getMerchantNetworkRails,
  putMerchantNetworkRailSettings,
  listActiveNetworkMaintenance,
};
export type {
  NetworkOrderabilityLamp,
  NetworksStatus,
  MerchantNetworkRailItem,
  ActiveNetworkMaintenance,
};

export {
  ApiError,
  getSession,
  login,
  logout,
  listOrders,
  listOrdersPage,
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

/** Owner contact from the team roster when the overview omits it (non-platform callers). */
export function ownerContactFromTeam(team: OrgMember[]): OrgPrimaryOwnerContact | null {
  const row = team.find((m) => m.role === "owner") ?? team[0] ?? null;
  if (!row) return null;
  return {
    userId: row.userId,
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    email: row.email,
    phone: row.phone ?? null,
    timezone: row.timezone ?? "",
    emailVerified: row.emailVerified === true,
    phoneVerified: row.phoneVerified === true,
    avatarUrl: row.avatarUrl ?? null,
    mfaEnrolled: row.mfaEnrolled === true,
  };
}

export type OrgOverviewMetrics = {
  periodStart: string;
  ordersMtd: number;
  settledVolumeMtdUsd: number;
  openOrders: number;
  /** Agents only: platform fees on bills overlapping the current UTC month. */
  platformFeeMtdUsd: number | null;
};

export type OrgOverview = {
  team: OrgMember[];
  audit: AuditLogEntry[];
  /** Period-to-date aggregates (null when the caller cannot read orders). */
  metrics: OrgOverviewMetrics | null;
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

export type ServiceBillUpdateAction =
  | "send"
  | "waive"
  | "cancel"
  | "mark_paid"
  | "adjust"
  | "grant_credit";

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

export type MissedInvoiceBlocker = "paused" | "no_commercial" | "earlier_first";

/** A bill the merchant's payment-date schedule expects but that does not exist. */
export type MissedInvoice = {
  orgId: string;
  orgName: string;
  periodStart: string;
  periodEnd: string;
  /** Day the bill should have been created (UTC). */
  invoiceOn: string;
  /** The period's only bill was cancelled. */
  previouslyCancelled: boolean;
  blocker: MissedInvoiceBlocker | null;
  blockerMessage: string | null;
  earlierInvoiceOn: string | null;
  willBeWaived: boolean;
  estimate: {
    subscriptionAmount: string;
    volumeFeeAmount: string;
    totalAmount: string;
    billedVolumeUsd: string;
  } | null;
};

/** Platform O/A — Find missed invoice: search a UTC date range (end ≤ today). */
export async function findMissedInvoices(
  from: string,
  to: string,
): Promise<{ from: string; to: string; today: string; missed: MissedInvoice[] }> {
  const q = new URLSearchParams({ from, to });
  const res = await apiFetch(`${API_BASE}/service-bills/missed?${q}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as {
    from: string;
    to: string;
    today: string;
    missed: MissedInvoice[];
  };
}

/** Create one reviewed missed invoice (same rules as the daily job). */
export async function createMissedInvoice(
  orgId: string,
  periodStart: string,
): Promise<ServiceBill> {
  const res = await apiFetch(`${API_BASE}/service-bills/missed`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orgId, periodStart }),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ServiceBill;
}

export type FeeWaiver = {
  orgId: string;
  orgName: string | null;
  monthsLeft: number;
  monthsGranted: number;
  monthsUsed: number;
  reason: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ActivationWaiver = {
  orgId: string;
  orgName: string | null;
  reason: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BillingWaivers = { fee: FeeWaiver[]; activation: ActivationWaiver[] };

export async function listBillingWaivers(): Promise<BillingWaivers> {
  const res = await apiFetch(`${API_BASE}/billing-waivers`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as BillingWaivers;
}

async function putBillingWaiver<T>(
  kind: "fee" | "activation",
  orgId: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await apiFetch(
    `${API_BASE}/billing-waivers/${kind}/${encodeURIComponent(orgId)}`,
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
  return (await res.json()) as T;
}

/** Add or edit: months left + reason (Owner / Administrator). */
export function putFeeWaiver(
  orgId: string,
  body: { monthsLeft: number; reason: string },
): Promise<FeeWaiver> {
  return putBillingWaiver<FeeWaiver>("fee", orgId, body);
}

/** `activated` = setup was already done, so the merchant was activated now. */
export function putActivationWaiver(
  orgId: string,
  body: { reason: string },
): Promise<ActivationWaiver & { activated: boolean }> {
  return putBillingWaiver<ActivationWaiver & { activated: boolean }>(
    "activation",
    orgId,
    body,
  );
}

export async function deleteBillingWaiver(
  kind: "fee" | "activation",
  orgId: string,
): Promise<void> {
  const res = await apiFetch(
    `${API_BASE}/billing-waivers/${kind}/${encodeURIComponent(orgId)}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok && res.status !== 204) await parseError(res);
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

export type FeeTierEffectiveTiming = "immediate" | "next_billing_cycle";

export type PlatformOrgPolicy = {
  maxAgentDepth: number;
  mfaEnforcement: boolean;
  sessionTimeoutMinutes: number;
};

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
  registryConfirmations?: number | null;
  registryMinAmount?: string | null;
  railOverride?: {
    requiredConfirmations: number | null;
    minAmount: string | null;
  };
  contractAddress: string | null;
  pairs: {
    asset: string;
    enabled: boolean;
    contractAddress: string | null;
    decimals: number;
    minAmount: string;
    registryMinAmount?: string;
    minAmountOverride?: string | null;
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

export async function getNetworkCatalog(): Promise<NetworkCatalog> {
  const res = await apiFetch(`${API_BASE}/platform/networks/catalog`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as NetworkCatalog;
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

export async function putPlatformNetworkRailSettings(
  network: string,
  body: {
    requiredConfirmations?: number | null;
    asset?: string;
    minAmount?: string | null;
  },
): Promise<{
  network: string;
  asset?: string | null;
  requiredConfirmations: number | null;
  minAmount: string | null;
  registryConfirmations: number | null;
  registryMinAmount: string | null;
  railOverride: {
    requiredConfirmations: number | null;
    minAmount: string | null;
  };
  updatedAt: string;
}> {
  const res = await apiFetch(
    `${API_BASE}/platform/networks/${encodeURIComponent(network)}/rail-settings`,
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
    asset?: string | null;
    requiredConfirmations: number | null;
    minAmount: string | null;
    registryConfirmations: number | null;
    registryMinAmount: string | null;
    railOverride: {
      requiredConfirmations: number | null;
      minAmount: string | null;
    };
    updatedAt: string;
  };
}

export type ScopedNetworkRailPair = {
  asset: string;
  parentFloorMinAmount: string;
  overrideMinAmount: string | null;
  effectiveMinAmount: string;
  registryMinAmount: string;
};

export type ScopedNetworkRailSettings = {
  network: string;
  orgId?: string;
  siteId?: string;
  merchantOrgId?: string | null;
  parentFloorConfirmations: number;
  overrideConfirmations: number | null;
  effectiveConfirmations: number;
  pairs: ScopedNetworkRailPair[];
  primaryAsset: string | null;
  updatedAt: string;
};

export async function getPlatformOrgNetworkRailSettings(
  orgId: string,
  network: string,
): Promise<ScopedNetworkRailSettings> {
  const res = await apiFetch(
    `${API_BASE}/platform/orgs/${encodeURIComponent(orgId)}/networks/${encodeURIComponent(network)}/rail-settings`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as ScopedNetworkRailSettings;
}

export async function putPlatformOrgNetworkRailSettings(
  orgId: string,
  network: string,
  body: {
    requiredConfirmations?: number | null;
    asset?: string;
    minAmount?: string | null;
  },
): Promise<ScopedNetworkRailSettings> {
  const res = await apiFetch(
    `${API_BASE}/platform/orgs/${encodeURIComponent(orgId)}/networks/${encodeURIComponent(network)}/rail-settings`,
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
  return (await res.json()) as ScopedNetworkRailSettings;
}

export async function getPlatformSiteNetworkRailSettings(
  siteId: string,
  network: string,
): Promise<ScopedNetworkRailSettings> {
  const res = await apiFetch(
    `${API_BASE}/platform/sites/${encodeURIComponent(siteId)}/networks/${encodeURIComponent(network)}/rail-settings`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as ScopedNetworkRailSettings;
}

export async function putPlatformSiteNetworkRailSettings(
  siteId: string,
  network: string,
  body: {
    requiredConfirmations?: number | null;
    asset?: string;
    minAmount?: string | null;
  },
): Promise<ScopedNetworkRailSettings> {
  const res = await apiFetch(
    `${API_BASE}/platform/sites/${encodeURIComponent(siteId)}/networks/${encodeURIComponent(network)}/rail-settings`,
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
  return (await res.json()) as ScopedNetworkRailSettings;
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
  settlement?: { network: string; address: string; asset?: string };
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
