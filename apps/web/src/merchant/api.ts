import { apiFetch, setLoginInProgress } from "../auth/apiFetch";
import { API_BASE, ApiError, parseError } from "../shared/apiCore";
import { getViewerTimeZone } from "../shared/dateTime";
import { requestSessionRefresh } from "../shared/sessionRefresh";
import {
  listActiveNetworkMaintenance,
  getNetworksStatus,
  getMerchantNetworkRails,
  putMerchantNetworkRailSettings,
} from "../shared/networkApi";
import type {
  ActiveNetworkMaintenance,
  NetworkOrderabilityLamp,
  NetworksStatus,
  MerchantNetworkRailItem,
} from "../shared/networkApi";
import {
  SERVICE_BILLS_LIST_LIMIT,
  listServiceBillsPage,
  listServiceBills,
  getServiceBill,
} from "../shared/serviceBillApi";
import type { ServiceBill, ServiceBillListPage } from "../shared/serviceBillApi";
import {
  listOrgs,
  setOrgStatus,
  patchOrgProfile,
  getMerchantCommercial,
  createOrg,
  deleteOrg,
  getOrgDeletePreview,
} from "../shared/orgApi";
import type {
  OrgAccount,
  MerchantCommercialSettings,
  OrgDeletePreview,
} from "../shared/orgApi";

export { ApiError };
export {
  listActiveNetworkMaintenance,
  getNetworksStatus,
  getMerchantNetworkRails,
  putMerchantNetworkRailSettings,
};
export type {
  ActiveNetworkMaintenance,
  NetworkOrderabilityLamp,
  NetworksStatus,
  MerchantNetworkRailItem,
};
export {
  SERVICE_BILLS_LIST_LIMIT,
  listServiceBillsPage,
  listServiceBills,
  getServiceBill,
};
export type { ServiceBill, ServiceBillListPage };
export {
  listOrgs,
  setOrgStatus,
  patchOrgProfile,
  getMerchantCommercial,
  createOrg,
  deleteOrg,
  getOrgDeletePreview,
};
export type { OrgAccount, MerchantCommercialSettings, OrgDeletePreview };

export type Session = {
  userId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  /** Optional display name (legacy; prefer firstName + lastName). */
  displayName?: string | null;
  /** Optional profile photo data-URL; null/absent uses the default avatar icon. */
  avatarUrl?: string | null;
  /** UI language preference (A10). */
  locale?: string;
  /** IANA timezone (A10). */
  timezone?: string;
  /** False while `timezone` is still the untouched UTC default. */
  timezoneConfirmed?: boolean;
  mustChangePassword?: boolean;
  /** True after invite-reset token use or email OTP. */
  emailVerified?: boolean;
  /** E.164 mobile, when set. */
  phone?: string | null;
  phoneVerified?: boolean;
  /** emailVerified AND phoneVerified. */
  contactVerified?: boolean;
  /** Person first+last+timezone complete for activity gate. */
  personComplete?: boolean;
  /** Org registration fields complete for activity gate. */
  profileComplete?: boolean;
  /** Settlement (merchant) or payout (agent) address set. */
  walletSet?: boolean;
  /** contact + person + profile + wallet. */
  setupReady?: boolean;
  /**
   * Merchant only: activation fee paid (or skip_activation).
   * When false, live mutations stay locked after setupReady.
   */
  activationPaid?: boolean;
  /** Org id whose profile/wallet must be completed. */
  setupOrgId?: string | null;
  /** True when TOTP enrollment completed; Owner/Admin must enroll when false. */
  mfaEnrolled?: boolean;
  /** Setup started but 6-digit verify not finished — reopen setup to view secret again. */
  mfaEnrollmentPending?: boolean;
  /** Business-Model §25: force enroll for Platform/Merchant Owner/Admin. */
  mfaEnforcement?: boolean;
  /** Live platform sliding session TTL (minutes). */
  sessionTimeoutMinutes?: number;
  memberships: Array<{
    orgId: string;
    orgType?: string | null;
    role: string;
    status?: "active" | "paused";
  }>;
};

export type PaymentOrder = {
  id: string;
  orgId?: string;
  orgName?: string | null;
  /** Merchant/site business zone for customer documents; absent when not set. */
  businessTimezone?: string | null;
  orderNumber: string;
  status: string;
  matchingMode: string;
  payableAmount: { amount: string; currency: string };
  receivedAmount?: { amount: string; currency: string } | null;
  receiveAddress: string;
  addressSource?: string;
  hdIndex?: number | null;
  memoOrTag?: string | null;
  asset: string;
  network: string;
  expiresAt: string;
  createdAt?: string;
  createdBy?: string;
  createdByEmail?: string | null;
  createdByName?: string | null;
  createdByAvatarUrl?: string | null;
  merchantReference?: string | null;
  /** Invoice USD (volume unit). */
  invoiceAmountUsd?: string;
  invoiceAmount?: string;
  invoiceCurrency?: string;
  invoiceDenomination?: string;
  marketRate?: string | null;
  pricingRate?: string | null;
  pricingMode?: string | null;
  rateSource?: string | null;
  rateSources?: Array<{ source: string; rate: string }> | null;
  referenceRate?: string | null;
  referenceSource?: string | null;
  rateWarning?: string | null;
  rateFetchedAt?: string | null;
  quoteExpiresAt?: string | null;
  payAmountBaseUnits?: string | null;
  assetDecimals?: number | null;
  /** Present when status is payment_anomaly (match / reorg reason code). */
  anomalyReason?: string | null;
  /** Staff note after resolve; order status is cancelled. */
  anomalyResolutionNote?: string | null;
  anomalyResolvedAt?: string | null;
  fulfillmentPolicy?: string;
  /** Channel that created the order; null = unknown (older POS builds). */
  createdVia?: OrderChannel | null;
};

export type OrderChannel = "web" | "pos" | "api";

export type OnChainDetails = {
  txHash?: string | null;
  blockHeight?: number | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  amount?: { amount: string; currency: string } | null;
  confirmedAt?: string | null;
};

export type PaymentDetails = {
  orderNumber: string;
  status: string;
  /** Merchant/site business zone for customer documents; null when not set. */
  businessTimezone?: string | null;
  matchingMode: string;
  paymentPageUrl: string;
  qrPayload: string;
  /** Optional `network:address?…` hint; POS QR uses qrPayload (HTTPS pay page). */
  walletUri?: string;
  receiveAddress: string;
  payableAmount: { amount: string; currency: string };
  copyAmount: string;
  asset: string;
  network: string;
  expiresAt: string;
  confirmations?: number;
  requiredConfirmations?: number;
  txHash?: string | null;
  createdAt?: string | null;
  confirmedAt?: string | null;
  anomalyReason?: string | null;
  merchantName?: string;
  invoiceAmountUsd?: string;
  invoiceCurrency?: string;
  pricingRate?: string | null;
  marketRate?: string | null;
  pricingMode?: string | null;
  rateSource?: string | null;
  rateSources?: Array<{ source: string; rate: string }> | null;
  referenceRate?: string | null;
  referenceSource?: string | null;
  rateWarning?: string | null;
  rateFetchedAt?: string | null;
  quoteExpiresAt?: string | null;
};

export async function login(
  email: string,
  password: string,
): Promise<{ session: Session; mfaRequired: boolean }> {
  setLoginInProgress(true);
  try {
    const res = await apiFetch(`${API_BASE}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) await parseError(res);
    const data = (await res.json()) as { session: Session; mfaRequired?: boolean };
    return { session: data.session, mfaRequired: data.mfaRequired === true };
  } finally {
    setLoginInProgress(false);
  }
}

export async function verifyMfa(code: string): Promise<Session> {
  setLoginInProgress(true);
  try {
    const res = await apiFetch(`${API_BASE}/auth/mfa/verify`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    if (!res.ok) await parseError(res);
    return (await res.json()) as Session;
  } finally {
    setLoginInProgress(false);
  }
}

export async function enrollMfa(): Promise<{
  secret: string;
  otpauthUrl: string;
  resumed?: boolean;
}> {
  const res = await apiFetch(`${API_BASE}/auth/mfa/enroll`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as {
    secret: string;
    otpauthUrl: string;
    resumed?: boolean;
  };
}

/** Clear enrolled/pending MFA after password check — then enroll again. */
export async function resetMfa(currentPassword: string): Promise<Session> {
  const res = await apiFetch(`${API_BASE}/auth/mfa/reset`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ currentPassword }),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as Session;
}

export async function getSession(): Promise<Session> {
  const res = await apiFetch(`${API_BASE}/auth/session`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as Session;
}

/** Cookie present but TOTP step-up not finished — privileged routes return 401 mfa_required. */
export type PortalBoot =
  | { status: "ok"; session: Session }
  | { status: "mfa_required" }
  | { status: "none" };

export async function loadPortalSession(): Promise<PortalBoot> {
  try {
    return { status: "ok", session: await getSession() };
  } catch (err) {
    if (err instanceof ApiError && err.code === "mfa_required") {
      return { status: "mfa_required" };
    }
    return { status: "none" };
  }
}

export async function logout(): Promise<void> {
  await apiFetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    credentials: "include",
  }).catch(() => undefined);
}

/** A2 — always succeeds from the caller's perspective when email is well-formed. */
export async function requestPasswordReset(email: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/auth/forgot-password`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (res.status === 204 || res.ok) {
    return;
  }
  await parseError(res);
}

export async function resetPasswordWithToken(
  token: string,
  password: string,
): Promise<void> {
  const res = await apiFetch(`${API_BASE}/auth/reset-password`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (res.status === 204) {
    return;
  }
  await parseError(res);
}

export async function createOrder(input: {
  amountUsd?: string;
  amountCrypto?: string;
  invoiceAmount?: string;
  invoiceCurrency?: "USD" | "EUR";
  invoiceDenomination?: "fiat" | "crypto";
  asset: string;
  network: string;
  validitySeconds: number;
  merchantReference?: string;
  /** Required by the API when the user has several merchant/site memberships. */
  orgId?: string | null;
}): Promise<PaymentOrder> {
  const res = await apiFetch(`${API_BASE}/orders`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": `web-${crypto.randomUUID()}`,
      "X-PaymentGate-Client": "web",
    },
    body: JSON.stringify({
      ...(input.invoiceDenomination === "crypto" || input.amountCrypto
        ? {
            amountCrypto: input.amountCrypto ?? input.invoiceAmount,
            invoiceDenomination: "crypto",
          }
        : {
            amountUsd: input.amountUsd ?? input.invoiceAmount,
            invoiceAmount: input.invoiceAmount ?? input.amountUsd,
            invoiceCurrency: input.invoiceCurrency ?? "USD",
            invoiceDenomination: "fiat",
          }),
      asset: input.asset,
      network: input.network,
      validitySeconds: input.validitySeconds,
      ...(input.orgId ? { orgId: input.orgId } : {}),
      ...(input.merchantReference?.trim()
        ? {
            merchantMetadata: {
              reference: input.merchantReference.trim().slice(0, 200),
            },
          }
        : {}),
    }),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PaymentOrder;
}

export async function getPaymentDetails(orderId: string): Promise<PaymentDetails> {
  const res = await apiFetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}/payment`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PaymentDetails;
}

const inflightOrderLists = new Map<string, Promise<PaymentOrder[]>>();

export type PaymentOrderListSummary = {
  count: number;
  invoiceAmountUsd: string | null;
  byAsset: { asset: string; payableAmount: string; receivedAmount: string }[];
};

export type PaymentOrderListPage = {
  items: PaymentOrder[];
  total: number;
  limit: number;
  offset: number;
  summary: PaymentOrderListSummary;
};

export async function listOrdersPage(opts?: {
  status?: string;
  limit?: number;
  offset?: number;
  orgId?: string;
  includeSubtree?: boolean;
  agentOrgId?: string;
  createdBy?: string;
  createdFrom?: string;
  createdTo?: string;
  q?: string;
  asset?: string;
  network?: string;
  createdVia?: OrderChannel | "unknown";
}): Promise<PaymentOrderListPage> {
  const q = new URLSearchParams();
  if (opts?.status) q.set("status", opts.status);
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  if (opts?.offset != null) q.set("offset", String(opts.offset));
  if (opts?.orgId) q.set("orgId", opts.orgId);
  if (opts?.includeSubtree) q.set("includeSubtree", "1");
  if (opts?.agentOrgId) q.set("agentOrgId", opts.agentOrgId);
  if (opts?.createdBy) q.set("createdBy", opts.createdBy);
  if (opts?.createdFrom) q.set("createdFrom", opts.createdFrom);
  if (opts?.createdTo) q.set("createdTo", opts.createdTo);
  if (opts?.q) q.set("q", opts.q);
  if (opts?.asset) q.set("asset", opts.asset);
  if (opts?.network) q.set("network", opts.network);
  if (opts?.createdVia) q.set("createdVia", opts.createdVia);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await apiFetch(`${API_BASE}/orders${suffix}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as {
    items: PaymentOrder[];
    total?: number;
    limit?: number;
    offset?: number;
    summary?: PaymentOrderListSummary;
  };
  const items = data.items ?? [];
  const total = data.total ?? items.length;
  return {
    items,
    total,
    limit: data.limit ?? opts?.limit ?? 100,
    offset: data.offset ?? opts?.offset ?? 0,
    summary: data.summary ?? {
      count: total,
      invoiceAmountUsd: null,
      byAsset: [],
    },
  };
}

export async function listOrders(opts?: {
  status?: string;
  limit?: number;
  offset?: number;
  orgId?: string;
  includeSubtree?: boolean;
  agentOrgId?: string;
  createdBy?: string;
  createdFrom?: string;
  createdTo?: string;
  q?: string;
  asset?: string;
  network?: string;
  createdVia?: OrderChannel | "unknown";
}): Promise<PaymentOrder[]> {
  const key = JSON.stringify({
    status: opts?.status ?? "",
    limit: opts?.limit ?? "",
    offset: opts?.offset ?? "",
    orgId: opts?.orgId ?? "",
    includeSubtree: opts?.includeSubtree ? "1" : "",
    agentOrgId: opts?.agentOrgId ?? "",
    createdBy: opts?.createdBy ?? "",
    createdFrom: opts?.createdFrom ?? "",
    createdTo: opts?.createdTo ?? "",
    q: opts?.q ?? "",
    asset: opts?.asset ?? "",
    network: opts?.network ?? "",
    createdVia: opts?.createdVia ?? "",
  });
  const hit = inflightOrderLists.get(key);
  if (hit) return hit;
  const pending = listOrdersPage(opts)
    .then((page) => page.items)
    .finally(() => {
      inflightOrderLists.delete(key);
    });
  inflightOrderLists.set(key, pending);
  return pending;
}

export type OrderSummary = {
  periodVolume: string;
  volumeByDay: { date: string; volume: string }[];
  volumeByOrg: { orgId: string; volume: string }[];
  anomalies: PaymentOrder[];
};

export async function getOrderSummary(
  from: string,
  to: string,
): Promise<OrderSummary> {
  const q = new URLSearchParams({ from, to });
  const res = await apiFetch(`${API_BASE}/orders/summary?${q}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as OrderSummary;
}

export async function getOrder(orderId: string): Promise<PaymentOrder> {
  const res = await apiFetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PaymentOrder;
}

/** Cancel pending payment order. O/A any on org; Cashier own only. */
export async function cancelOrder(
  orderId: string,
  body?: { note?: string },
): Promise<PaymentOrder> {
  const res = await apiFetch(
    `${API_BASE}/orders/${encodeURIComponent(orderId)}/cancel`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body?.note?.trim() ? { note: body.note.trim() } : {}),
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as PaymentOrder;
}

/** Resolve payment anomaly after manual reconcile. Required note. Never Mark paid. */
export async function resolveOrderAnomaly(
  orderId: string,
  note: string,
): Promise<PaymentOrder> {
  const res = await apiFetch(
    `${API_BASE}/orders/${encodeURIComponent(orderId)}/resolve-anomaly`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ note: note.trim() }),
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as PaymentOrder;
}

export async function getOnChain(orderId: string): Promise<OnChainDetails> {
  const res = await apiFetch(
    `${API_BASE}/orders/${encodeURIComponent(orderId)}/on-chain`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as OnChainDetails;
}

/** Relative CSV export URL (session cookie). Cashiers get 403 from API. */
export function ordersCsvUrl(opts?: {
  status?: string;
  orgId?: string;
  includeSubtree?: boolean;
  createdBy?: string;
  createdFrom?: string;
  createdTo?: string;
  q?: string;
  asset?: string;
  network?: string;
  createdVia?: OrderChannel | "unknown";
  limit?: number;
}): string {
  const q = new URLSearchParams({ format: "csv" });
  if (opts?.status) q.set("status", opts.status);
  if (opts?.orgId) q.set("orgId", opts.orgId);
  if (opts?.includeSubtree) q.set("includeSubtree", "1");
  if (opts?.createdBy) q.set("createdBy", opts.createdBy);
  if (opts?.createdFrom) q.set("createdFrom", opts.createdFrom);
  if (opts?.createdTo) q.set("createdTo", opts.createdTo);
  if (opts?.q) q.set("q", opts.q);
  if (opts?.asset) q.set("asset", opts.asset);
  if (opts?.network) q.set("network", opts.network);
  if (opts?.createdVia) q.set("createdVia", opts.createdVia);
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  q.set("tz", getViewerTimeZone());
  return `${API_BASE}/orders?${q}`;
}

export type InvoiceExportJob = {
  id: string;
  status: "queued" | "running" | "ready" | "failed" | "expired" | string;
  totalRows: number | null;
  error: string | null;
  createdAt: string;
  readyAt: string | null;
  expiresAt: string;
};

export type InvoiceExportFilters = {
  status?: string;
  orgId?: string;
  includeSubtree?: boolean;
  createdBy?: string;
  createdFrom?: string;
  createdTo?: string;
  q?: string;
  asset?: string;
  network?: string;
  createdVia?: OrderChannel | "unknown";
};

export async function createInvoiceExport(
  filters: InvoiceExportFilters,
): Promise<InvoiceExportJob> {
  const res = await apiFetch(`${API_BASE}/orders/exports`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...filters, tz: getViewerTimeZone() }),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as InvoiceExportJob;
}

export async function getInvoiceExport(
  id: string,
): Promise<InvoiceExportJob> {
  const res = await apiFetch(
    `${API_BASE}/orders/exports/${encodeURIComponent(id)}`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as InvoiceExportJob;
}

export function invoiceExportDownloadUrl(id: string): string {
  return `${API_BASE}/orders/exports/${encodeURIComponent(id)}/download`;
}

export type SettingsSource = "merchant" | "inherit" | "override";

export type MatchingModeSettings = {
  orgId: string;
  matchingMode: string;
  underpayTolerance?: string;
  source?: SettingsSource;
  parentOrgId?: string | null;
  effectiveOrgId?: string;
};

export type FulfillmentPolicySettings = {
  orgId: string;
  fulfillmentPolicy: string;
  source?: SettingsSource;
  parentOrgId?: string | null;
  effectiveOrgId?: string;
};

export type OrgRetentionSettings = {
  orgId: string;
  orderDeleteDays: number;
  source?: SettingsSource;
  parentOrgId?: string | null;
  effectiveOrgId?: string;
};

export type SettlementAddress = {
  orgId: string;
  asset: string;
  network: string;
  address: string;
  pendingAddress?: string | null;
  pendingActivatesAt?: string | null;
  status: "active" | "pending_cool_down";
};

export type XpubSettings = {
  orgId: string;
  asset: string;
  network: string;
  xPubConfigured: boolean;
  /** Full watch-only public key — platform Owner/Admin only. */
  xPub?: string | null;
  pendingXPub: boolean;
  pendingActivatesAt?: string | null;
  status: "active" | "pending_cool_down";
};

export type HdPoolAddress = {
  id: string;
  orgId: string;
  asset: string;
  network: string;
  hdIndex: number;
  receiveAddress: string;
  status: "FREE" | "IN_USE" | "COOLDOWN";
  cooldownUntil?: string | null;
  lastOrderId?: string | null;
};

export type HdPoolList = {
  derivationPath: string;
  items: HdPoolAddress[];
};

export async function getMatchingMode(orgId: string): Promise<MatchingModeSettings> {
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/matching-mode`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as MatchingModeSettings;
}

export async function putMatchingMode(
  orgId: string,
  matchingMode: string,
): Promise<MatchingModeSettings> {
  const body = { matchingMode };
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/matching-mode`, {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as MatchingModeSettings;
}

export async function getFulfillmentPolicy(
  orgId: string,
): Promise<FulfillmentPolicySettings> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/fulfillment-policy`,
    { credentials: "include" },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as FulfillmentPolicySettings;
}

export async function putFulfillmentPolicy(
  orgId: string,
  fulfillmentPolicy: string,
): Promise<FulfillmentPolicySettings> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/fulfillment-policy`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fulfillmentPolicy }),
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as FulfillmentPolicySettings;
}

export type PosSettings = {
  orgId: string;
  /** Merchant policy: cashiers may create orders on the web (POS app always allowed). */
  cashierWebOrders: boolean;
  source: "merchant" | "inherit" | "override";
  parentOrgId: string | null;
  effectiveOrgId: string;
};

export async function getPosSettings(orgId: string): Promise<PosSettings> {
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/pos-settings`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PosSettings;
}

export async function putPosSettings(
  orgId: string,
  cashierWebOrders: boolean,
): Promise<PosSettings> {
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/pos-settings`, {
    method: "PUT",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ cashierWebOrders }),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PosSettings;
}

export async function listSettlement(orgId: string): Promise<SettlementAddress[]> {
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/settlement`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: SettlementAddress[] };
  return data.items ?? [];
}

/** One wallet per network: the address is saved for every asset on `network`. */
export async function putSettlement(
  orgId: string,
  body: { network: string; address: string; mfaCode: string; asset?: string },
): Promise<SettlementAddress & { items?: SettlementAddress[] }> {
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/settlement`, {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  const saved = (await res.json()) as SettlementAddress & { items?: SettlementAddress[] };
  requestSessionRefresh();
  return saved;
}

export async function listXpub(orgId: string): Promise<XpubSettings[]> {
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/xpub`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: XpubSettings[] };
  return data.items ?? [];
}

export async function putXpub(
  orgId: string,
  body: { asset: string; network: string; xPub: string; mfaCode: string },
): Promise<XpubSettings> {
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/xpub`, {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as XpubSettings;
}

export async function listHdPool(orgId: string): Promise<HdPoolList> {
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/hd-pool`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as HdPoolList;
}

export async function getRetention(orgId: string): Promise<OrgRetentionSettings> {
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/retention`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as OrgRetentionSettings;
}

export type ServiceBillCheckout = {
  billId: string;
  totalAmount: string;
  currency: string;
  payTo: string;
  qrPayload?: string | null;
  instructions: string;
};

export async function getServiceBillCheckout(billId: string): Promise<ServiceBillCheckout> {
  const res = await apiFetch(
    `${API_BASE}/service-bills/${encodeURIComponent(billId)}/checkout`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as ServiceBillCheckout;
}

export type ApiKey = {
  id: string;
  keyId: string;
  label: string;
  createdAt?: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  scopes?: string[];
  ipAllowlist?: string[];
};

export type ApiKeyCreated = ApiKey & { secret: string };

export type WebhookEndpoint = {
  id: string;
  orgId: string;
  url: string;
  events: string[];
  enabled: boolean;
  createdAt?: string;
};

export type WebhookCreated = WebhookEndpoint & { signingSecret: string };

export type WebhookDelivery = {
  id: string;
  eventId?: string;
  eventType: string;
  orderId?: string | null;
  status: string;
  attempt: number;
  httpStatus?: number | null;
  responseStatus?: number | null;
  nextRetryAt?: string | null;
  createdAt?: string;
  deliveredAt?: string | null;
};

export type NotificationPreference = {
  eventType: string;
  email: boolean;
  inApp: boolean;
};

export type NotificationPreferenceList = {
  items: NotificationPreference[];
  emailAvailable: boolean;
};

export async function listApiKeys(orgId?: string): Promise<ApiKey[]> {
  const q = orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";
  const res = await apiFetch(`${API_BASE}/api-keys${q}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: ApiKey[] };
  return data.items ?? [];
}

export async function createApiKey(body: {
  label: string;
  expiresAt?: string | null;
  scopes?: string[];
  ipAllowlist?: string[];
  orgId?: string;
}): Promise<ApiKeyCreated> {
  const res = await apiFetch(`${API_BASE}/api-keys`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ApiKeyCreated;
}

export async function revokeApiKey(apiKeyId: string, orgId?: string): Promise<void> {
  const q = orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";
  const res = await apiFetch(`${API_BASE}/api-keys/${encodeURIComponent(apiKeyId)}${q}`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok && res.status !== 204) await parseError(res);
}

export async function rotateApiKey(
  apiKeyId: string,
  body?: {
    expiresAt?: string | null;
    scopes?: string[];
    ipAllowlist?: string[];
    orgId?: string;
  },
): Promise<ApiKeyCreated> {
  const res = await apiFetch(`${API_BASE}/api-keys/${encodeURIComponent(apiKeyId)}/rotate`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ApiKeyCreated;
}

export async function listWebhooks(orgId?: string): Promise<WebhookEndpoint[]> {
  const q = orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";
  const res = await apiFetch(`${API_BASE}/webhooks${q}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: WebhookEndpoint[] };
  return data.items ?? [];
}

export async function registerWebhook(body: {
  url: string;
  events?: string[];
  orgId?: string;
}): Promise<WebhookCreated> {
  const res = await apiFetch(`${API_BASE}/webhooks`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as WebhookCreated;
}

export async function deleteWebhook(webhookId: string, orgId?: string): Promise<void> {
  const q = orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";
  const res = await apiFetch(`${API_BASE}/webhooks/${encodeURIComponent(webhookId)}${q}`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok && res.status !== 204) await parseError(res);
}

export async function rotateWebhookSecret(
  webhookId: string,
  orgId?: string,
): Promise<WebhookCreated> {
  const q = orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";
  const res = await apiFetch(
    `${API_BASE}/webhooks/${encodeURIComponent(webhookId)}/rotate-secret${q}`,
    {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as WebhookCreated;
}

export async function testWebhook(body?: {
  webhookId?: string;
  orgId?: string;
}): Promise<{ queued: number }> {
  const res = await apiFetch(`${API_BASE}/webhooks/test`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as { queued: number };
}

export async function listWebhookDeliveries(
  webhookId: string,
  orgId?: string,
): Promise<WebhookDelivery[]> {
  const q = orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";
  const res = await apiFetch(
    `${API_BASE}/webhooks/${encodeURIComponent(webhookId)}/deliveries${q}`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: WebhookDelivery[] };
  return (data.items ?? []).map((d) => ({
    ...d,
    responseStatus: d.responseStatus ?? d.httpStatus ?? null,
  }));
}

export async function resendWebhookDelivery(
  webhookId: string,
  deliveryId: string,
  orgId?: string,
): Promise<WebhookDelivery> {
  const q = orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";
  const res = await apiFetch(
    `${API_BASE}/webhooks/${encodeURIComponent(webhookId)}/deliveries/${encodeURIComponent(deliveryId)}/resend${q}`,
    {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  const d = (await res.json()) as WebhookDelivery;
  return { ...d, responseStatus: d.responseStatus ?? d.httpStatus ?? null };
}

export async function getNotificationPreferences(
  orgId: string,
): Promise<NotificationPreferenceList> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/notification-preferences`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as NotificationPreferenceList;
  return {
    items: data.items ?? [],
    emailAvailable: data.emailAvailable === true,
  };
}

export async function putNotificationPreferences(
  orgId: string,
  items: NotificationPreference[],
): Promise<NotificationPreferenceList> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/notification-preferences`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items }),
    },
  );
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as NotificationPreferenceList;
  return {
    items: data.items ?? [],
    emailAvailable: data.emailAvailable === true,
  };
}

export type OrgMembership = {
  orgId: string;
  userId: string;
  role: string;
  orgType: string;
  status: "active" | "paused";
};

export type OrgMember = OrgMembership & {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  avatarUrl?: string | null;
  timezone?: string | null;
  /** Present on org user list (B15 / C11 / D16). */
  mfaEnrolled?: boolean;
  /** Cashier POS unlock PIN set (org user list). */
  posPinConfigured?: boolean;
  lastLoginAt?: string | null;
};

export type OrgMemberEmailRow = {
  orgId: string;
  emails: string[];
  /** Preferred Owner-role email when present. */
  ownerEmail?: string | null;
};

export async function listOrgMemberEmails(opts?: {
  types?: string[];
}): Promise<OrgMemberEmailRow[]> {
  const q = new URLSearchParams();
  if (opts?.types?.length) q.set("types", opts.types.join(","));
  const suffix = q.toString() ? `?${q}` : "";
  const res = await apiFetch(`${API_BASE}/org-member-emails${suffix}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: OrgMemberEmailRow[] };
  return data.items ?? [];
}

export async function listOrgUsers(orgId: string): Promise<OrgMember[]> {
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/users`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: OrgMember[] };
  return data.items ?? [];
}

export async function getOrg(orgId: string): Promise<OrgAccount> {
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as OrgAccount;
}

export async function inviteOrgUser(
  orgId: string,
  body: { email: string; role: string },
): Promise<InviteOrgUserResult> {
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/users`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as InviteOrgUserResult;
}

export type InviteOrgUserResult = OrgMembership & {
  temporaryPassword?: string | null;
  invitePath?: string | null;
  inviteUrl?: string | null;
  emailDelivery?: { status: string; mode: string };
};

export async function changePassword(body: {
  currentPassword: string;
  newPassword: string;
}): Promise<Session> {
  const res = await apiFetch(`${API_BASE}/auth/change-password`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as Session;
}

export type ContactOtpSendResult = {
  status: "sent" | "already_verified";
  email?: string;
  phone?: string;
  /** True when OTP targets a new address/number; current stays active until verify. */
  pendingChange?: boolean;
  expiresAt?: string;
  devCode?: string;
  session?: Session;
};

export async function sendEmailOtp(email?: string): Promise<ContactOtpSendResult> {
  const res = await apiFetch(`${API_BASE}/auth/contact/email/send`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(email ? { email } : {}),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ContactOtpSendResult;
}

export async function verifyEmailOtp(code: string): Promise<Session> {
  const res = await apiFetch(`${API_BASE}/auth/contact/email/verify`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ code: code.trim() }),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as Session;
}

export async function sendPhoneOtp(phone?: string): Promise<ContactOtpSendResult> {
  const res = await apiFetch(`${API_BASE}/auth/contact/phone/send`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(phone ? { phone } : {}),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ContactOtpSendResult;
}

export async function verifyPhoneOtp(code: string): Promise<Session> {
  const res = await apiFetch(`${API_BASE}/auth/contact/phone/verify`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ code: code.trim() }),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as Session;
}

/** Cashier POS unlock PIN — managed on web, verified on device. */
export async function getPosPinStatus(): Promise<{ configured: boolean }> {
  const res = await apiFetch(`${API_BASE}/auth/pos-pin`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as { configured: boolean };
}

export async function setPosPin(body: {
  pin: string;
  currentPin?: string;
}): Promise<{ configured: boolean }> {
  const res = await apiFetch(`${API_BASE}/auth/pos-pin`, {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as { configured: boolean };
}

export async function clearPosPin(currentPin: string): Promise<{ configured: boolean }> {
  const res = await apiFetch(`${API_BASE}/auth/pos-pin`, {
    method: "DELETE",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ currentPin }),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as { configured: boolean };
}

/** Owner/Admin generates a new POS PIN for a member; the PIN is returned only this once. */
export async function adminGenerateMemberPosPin(
  orgId: string,
  userId: string,
): Promise<{ configured: boolean; pin: string }> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/pos-pin`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ generate: true }),
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as { configured: boolean; pin: string };
}

/** Owner/Admin clears a team member's Cashier POS PIN. */
export async function adminClearMemberPosPin(
  orgId: string,
  userId: string,
): Promise<{ configured: boolean }> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/pos-pin`,
    {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as { configured: boolean };
}

export type PosTerminal = {
  id: string;
  status: "active" | "revoked";
  deviceModel: string | null;
  appVersion: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  boundBy: string | null;
  boundByName: string | null;
  boundByEmail: string | null;
  /** List responses only. */
  boundByAvatarUrl?: string | null;
  orgId: string;
  orgName: string | null;
  orgType: string | null;
  orgIconKey: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
};

export async function listPosTerminals(orgId: string): Promise<PosTerminal[]> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/pos-terminals`,
    { credentials: "include", headers: { Accept: "application/json" } },
  );
  if (!res.ok) await parseError(res);
  return ((await res.json()) as { items: PosTerminal[] }).items;
}

/** Signs out whoever is on the device; it must be set up again to be used. */
export async function revokePosTerminal(
  orgId: string,
  terminalId: string,
  reason?: string,
): Promise<PosTerminal> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/pos-terminals/${encodeURIComponent(terminalId)}/revoke`,
    {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(reason ? { reason } : {}),
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as PosTerminal;
}

/** A10 — update profile / language / MFA preference / session TTL. */
export async function updateProfile(body: {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  locale?: string;
  timezone?: string;
  mfaEnforcement?: boolean;
  sessionTimeoutMinutes?: number;
}): Promise<Session> {
  const res = await apiFetch(`${API_BASE}/auth/profile`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as Session;
}

export async function assignOrgUserRole(
  orgId: string,
  userId: string,
  role: string,
): Promise<OrgMembership> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/role`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role }),
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as OrgMembership;
}

export async function setOrgUserStatus(
  orgId: string,
  userId: string,
  status: "active" | "paused",
): Promise<OrgMembership> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/status`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as OrgMembership;
}

export async function removeOrgUser(orgId: string, userId: string): Promise<void> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok && res.status !== 204) await parseError(res);
}

export async function getPlatformPricingSettings(): Promise<{
  ratesEnabled: boolean;
  modePegged1to1Enabled: boolean;
  modeMarketEnabled: boolean;
  depegThresholdBps: number;
  allowedQuoteLockSeconds: number[];
  minRateSources: number;
  rateVenues: string[];
  chainlinkReferenceEnabled: boolean;
  referenceDeviationBps: number;
}> {
  const res = await apiFetch(`${API_BASE}/platform/settings/pricing`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as {
    ratesEnabled: boolean;
    modePegged1to1Enabled: boolean;
    modeMarketEnabled: boolean;
    depegThresholdBps: number;
    allowedQuoteLockSeconds: number[];
    minRateSources: number;
    rateVenues: string[];
    chainlinkReferenceEnabled: boolean;
    referenceDeviationBps: number;
  };
}

export async function putPlatformPricingSettings(body: {
  ratesEnabled?: boolean;
  modePegged1to1Enabled?: boolean;
  modeMarketEnabled?: boolean;
  depegThresholdBps?: number;
  allowedQuoteLockSeconds?: number[];
  minRateSources?: number;
  rateVenues?: string[];
  chainlinkReferenceEnabled?: boolean;
  referenceDeviationBps?: number;
}): Promise<unknown> {
  const res = await apiFetch(`${API_BASE}/platform/settings/pricing`, {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export type RateFeedVenueRow = {
  venue: string;
  enabled: boolean;
  supported: boolean;
  rate: string | null;
  error: string | null;
  latencyMs: number | null;
  deviationBps: number | null;
  /** Set while the circuit breaker skips this source after repeated failures. */
  pausedUntil?: string | null;
};

export type RateFeedAssetStatus = {
  asset: string;
  median: string | null;
  lastGoodAgeSeconds?: number | null;
  healthyCount: number;
  requiredSources: number;
  quotable: boolean;
  venues: RateFeedVenueRow[];
  chainlink: {
    rate: string | null;
    error: string | null;
    latencyMs: number;
    deviationBps: number | null;
    withinBand: boolean | null;
  } | null;
};

export type RateFeedStatus = {
  checkedAt: string;
  cached: boolean;
  settings: {
    ratesEnabled: boolean;
    minRateSources: number;
    rateVenues: string[];
    chainlinkReferenceEnabled: boolean;
    referenceDeviationBps: number;
    staleMaxSeconds?: number;
    pegLastKnownMaxSeconds?: number;
    refreshIntervalSeconds?: number;
    coinGeckoIntervalSeconds?: number;
  };
  monitor?: {
    status: "ok" | "degraded" | "off" | "unknown";
    checkedAt: string | null;
    assets: Array<{
      asset: string;
      state: "ok" | "stale" | "down" | "rejected";
      sources: number;
      detail: string | null;
    }>;
    alertOpen: boolean;
    alertSince: string | null;
  };
  assets: RateFeedAssetStatus[];
  eurUsd: {
    median: string | null;
    healthyCount: number;
    requiredSources: number;
    quotable: boolean;
    latencyMs: number;
    venues: Array<{
      venue: string;
      supported?: boolean;
      rate: string | null;
      error: string | null;
      deviationBps: number | null;
    }>;
  };
};

export async function getRateFeedStatus(refresh = false): Promise<RateFeedStatus> {
  const res = await apiFetch(
    `${API_BASE}/platform/rates/status${refresh ? "?refresh=1" : ""}`,
    { credentials: "include", headers: { Accept: "application/json" } },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as RateFeedStatus;
}

export type RateTestQuoteResult = {
  asset: string;
  network: string;
  decimals: number;
  minAmount: string;
  pricingMode: string;
  minRateSources: number;
  quote: {
    invoiceAmountUsd: string;
    invoiceAmount: string;
    invoiceCurrency: string;
    invoiceDenomination: string;
    marketRate: string;
    pricingRate: string;
    pricingMode: string;
    rateSource: string;
    rateFetchedAt: string;
    rateSources: Array<{ source: string; rate: string }> | null;
    referenceRate: string | null;
    referenceSource: string | null;
    rateWarning: string | null;
    quoteExpiresAt: string;
    payAmount: string;
    payAmountBaseUnits: string;
    assetDecimals: number;
  };
};

export async function postRateTestQuote(body: {
  asset: string;
  network: string;
  amount: string;
  currency: "USD" | "EUR" | "CRYPTO";
  pricingMode: "market" | "pegged_1to1";
}): Promise<RateTestQuoteResult> {
  const res = await apiFetch(`${API_BASE}/platform/rates/test-quote`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as RateTestQuoteResult;
}

export async function getMerchantPricingSettings(orgId: string): Promise<{
  pricingMode: string;
  quoteLockSeconds: number;
  effective?: {
    ratesEnabled: boolean;
    modeAvailable: boolean;
    pricingMode: string;
    quoteLockSeconds: number;
  };
}> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/pricing`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as {
    pricingMode: string;
    quoteLockSeconds: number;
    effective?: {
      ratesEnabled: boolean;
      modeAvailable: boolean;
      pricingMode: string;
      quoteLockSeconds: number;
    };
  };
}

export async function putMerchantPricingSettings(
  orgId: string,
  body: { pricingMode?: string; quoteLockSeconds?: number },
): Promise<unknown> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/pricing`,
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
  return res.json();
}
