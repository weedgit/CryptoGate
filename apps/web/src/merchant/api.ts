import { apiFetch, setLoginInProgress } from "../auth/apiFetch";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  "/v1";

export type Session = {
  userId: string;
  email: string;
  /** Optional display name (A10). */
  displayName?: string | null;
  /** UI language preference (A10). */
  locale?: string;
  /** IANA timezone (A10). */
  timezone?: string;
  mustChangePassword?: boolean;
  /** True when TOTP enrollment completed; Owner/Admin must enroll when false. */
  mfaEnrolled?: boolean;
  /** Setup started but 6-digit verify not finished — reopen setup to view secret again. */
  mfaEnrollmentPending?: boolean;
  /** Live platform org policy — force Owner/Admin enrollment when true. */
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
  merchantReference?: string | null;
  /** Present when status is payment_anomaly (match / reorg reason code). */
  anomalyReason?: string | null;
  /** Staff note after resolve; order status is cancelled. */
  anomalyResolutionNote?: string | null;
  anomalyResolvedAt?: string | null;
  fulfillmentPolicy?: string;
};

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
};

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function parseError(res: Response): Promise<never> {
  const body = await res.text();
  try {
    const json = JSON.parse(body) as {
      code?: string;
      message?: string;
      details?: unknown;
    };
    const raw = json.message?.trim() || "";
    const friendly =
      res.status >= 500
        ? "Something went wrong on the server. Please try again."
        : raw || `Request failed (${res.status})`;
    throw new ApiError(
      json.code ?? "http_error",
      friendly,
      res.status,
      json.details,
    );
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const friendly =
      res.status >= 500
        ? "Something went wrong on the server. Please try again."
        : body?.trim() || `Request failed (${res.status})`;
    throw new ApiError("http_error", friendly, res.status);
  }
}

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
  amount: string;
  asset: string;
  network: string;
  validitySeconds: number;
  merchantReference?: string;
}): Promise<PaymentOrder> {
  const res = await apiFetch(`${API_BASE}/orders`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": `web-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({
      amount: input.amount,
      asset: input.asset,
      network: input.network,
      validitySeconds: input.validitySeconds,
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

export type ActiveNetworkMaintenance = {
  network: string;
  message: string | null;
  startedAt: string | null;
  endsAt: string | null;
};

export async function listActiveNetworkMaintenance(): Promise<
  ActiveNetworkMaintenance[]
> {
  const res = await apiFetch(`${API_BASE}/network-maintenance`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items?: ActiveNetworkMaintenance[] };
  return data.items ?? [];
}

export type NetworkOrderabilityLamp = {
  code: "open" | "paused" | "down" | "off";
  label: string;
  tone: string;
};

export type NetworksStatus = {
  chainEnv: string;
  checkedAt: string;
  items: {
    network: string;
    title: string;
    lamp: NetworkOrderabilityLamp;
    maintenance: { active: boolean; message: string | null };
    ingestStatus: string;
    pairs: {
      asset: string;
      enabled: boolean;
      lamp: NetworkOrderabilityLamp;
      displayNetwork: string;
    }[];
  }[];
};

export async function getNetworksStatus(): Promise<NetworksStatus> {
  const res = await apiFetch(`${API_BASE}/networks/status`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as NetworksStatus;
}

export async function getPaymentDetails(orderId: string): Promise<PaymentDetails> {
  const res = await apiFetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}/payment`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PaymentDetails;
}

const inflightOrderLists = new Map<string, Promise<PaymentOrder[]>>();

export async function listOrders(opts?: {
  status?: string;
  limit?: number;
  orgId?: string;
  agentOrgId?: string;
}): Promise<PaymentOrder[]> {
  const key = JSON.stringify({
    status: opts?.status ?? "",
    limit: opts?.limit ?? "",
    orgId: opts?.orgId ?? "",
    agentOrgId: opts?.agentOrgId ?? "",
  });
  const hit = inflightOrderLists.get(key);
  if (hit) return hit;
  const pending = fetchOrderList(opts).finally(() => {
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

async function fetchOrderList(opts?: {
  status?: string;
  limit?: number;
  orgId?: string;
  agentOrgId?: string;
}): Promise<PaymentOrder[]> {
  const q = new URLSearchParams();
  if (opts?.status) q.set("status", opts.status);
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  if (opts?.orgId) q.set("orgId", opts.orgId);
  if (opts?.agentOrgId) q.set("agentOrgId", opts.agentOrgId);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await apiFetch(`${API_BASE}/orders${suffix}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: PaymentOrder[] };
  return data.items ?? [];
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
  limit?: number;
}): string {
  const q = new URLSearchParams({ format: "csv" });
  if (opts?.status) q.set("status", opts.status);
  if (opts?.orgId) q.set("orgId", opts.orgId);
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  return `${API_BASE}/orders?${q}`;
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

export type SiteSettingOverride = {
  id: string;
  siteOrgId: string;
  parentOrgId: string;
  settingKind: "settlement" | "xpub" | "matching_mode" | "order_retention" | "fulfillment_policy";
  status: "pending" | "approved" | "denied";
  payload: Record<string, unknown>;
  requestedBy?: string;
  decidedBy?: string | null;
  decidedAt?: string | null;
  createdAt: string;
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
  opts?: { underpayTolerance?: string },
): Promise<MatchingModeSettings> {
  const body: { matchingMode: string; underpayTolerance?: string } = {
    matchingMode,
  };
  if (opts?.underpayTolerance != null) {
    body.underpayTolerance = opts.underpayTolerance;
  }
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

export async function listSettlement(orgId: string): Promise<SettlementAddress[]> {
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/settlement`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: SettlementAddress[] };
  return data.items ?? [];
}

export async function putSettlement(
  orgId: string,
  body: { asset: string; network: string; address: string; mfaCode: string },
): Promise<SettlementAddress> {
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
  return (await res.json()) as SettlementAddress;
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

export async function listSiteOverrides(orgId: string): Promise<SiteSettingOverride[]> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/setting-overrides`,
    { credentials: "include", headers: { Accept: "application/json" } },
  );
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: SiteSettingOverride[] };
  return data.items ?? [];
}

export async function requestSiteOverride(
  orgId: string,
  body: { settingKind: SiteSettingOverride["settingKind"]; payload: Record<string, unknown> },
): Promise<SiteSettingOverride> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/setting-overrides`,
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
  return (await res.json()) as SiteSettingOverride;
}

export async function decideSiteOverride(
  orgId: string,
  overrideId: string,
  body: { decision: "approve" | "deny"; reason?: string; mfaCode?: string },
): Promise<SiteSettingOverride> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/setting-overrides/${encodeURIComponent(overrideId)}`,
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
  return (await res.json()) as SiteSettingOverride;
}

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
  /** Effective remittance destination (rx snapshot or live fee wallet). */
  remittancePayTo?: string | null;
  invoiceSeller?: { name: string; email: string | null };
  txAddress?: string | null;
  createdAt?: string | null;
};

export type ServiceBillCheckout = {
  billId: string;
  totalAmount: string;
  currency: string;
  payTo: string;
  qrPayload?: string | null;
  instructions: string;
};

export async function listServiceBills(opts?: {
  status?: string;
}): Promise<ServiceBill[]> {
  const q = new URLSearchParams();
  if (opts?.status) q.set("status", opts.status);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await apiFetch(`${API_BASE}/service-bills${suffix}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: ServiceBill[] };
  return data.items ?? [];
}

export async function getServiceBill(billId: string): Promise<ServiceBill> {
  const res = await apiFetch(`${API_BASE}/service-bills/${encodeURIComponent(billId)}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ServiceBill;
}

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

export type OrgAccount = {
  id: string;
  type: string;
  name: string;
  parentId: string | null;
  status?: "active" | "paused";
  structure?: string;
  country?: string | null;
  legalName?: string | null;
  createdAt?: string;
};

export type OrgMembership = {
  orgId: string;
  userId: string;
  role: string;
  orgType: string;
  status: "active" | "paused";
};

export type OrgMember = OrgMembership & {
  email: string;
  /** Present on org user list (B15 / C11 / D16). */
  mfaEnrolled?: boolean;
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

export async function listOrgs(): Promise<OrgAccount[]> {
  const res = await apiFetch(`${API_BASE}/orgs`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: OrgAccount[] };
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

/** A10 — update profile / language / MFA preference / session TTL. */
export async function updateProfile(body: {
  displayName?: string | null;
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

export async function createOrg(body: {
  type: string;
  name: string;
  parentId: string;
  structure?: string;
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
  if (!res.ok && res.status !== 204) await parseError(res);
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
