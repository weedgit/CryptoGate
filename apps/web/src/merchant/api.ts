const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  "/v1";

export type Session = {
  userId: string;
  email: string;
  memberships: Array<{ orgId: string; orgType?: string | null; role: string }>;
};

export type PaymentOrder = {
  id: string;
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
  createdBy?: string;
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
  receiveAddress: string;
  payableAmount: { amount: string; currency: string };
  copyAmount: string;
  asset: string;
  network: string;
  expiresAt: string;
};

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
  ) {
    super(message);
  }
}

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

export async function login(email: string, password: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { session: Session; mfaRequired?: boolean };
  if (data.mfaRequired) {
    throw new ApiError(
      "mfa_required",
      "This account requires MFA. Complete MFA on the web portal first.",
      403,
    );
  }
  return data.session;
}

export async function getSession(): Promise<Session> {
  const res = await fetch(`${API_BASE}/auth/session`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as Session;
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    credentials: "include",
  }).catch(() => undefined);
}

export async function createOrder(input: {
  amount: string;
  asset: string;
  network: string;
  validitySeconds: number;
}): Promise<PaymentOrder> {
  const res = await fetch(`${API_BASE}/orders`, {
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
    }),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PaymentOrder;
}

export async function getPaymentDetails(orderId: string): Promise<PaymentDetails> {
  const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}/payment`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PaymentDetails;
}

export async function listOrders(opts?: {
  status?: string;
  limit?: number;
  orgId?: string;
}): Promise<PaymentOrder[]> {
  const q = new URLSearchParams();
  if (opts?.status) q.set("status", opts.status);
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  if (opts?.orgId) q.set("orgId", opts.orgId);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await fetch(`${API_BASE}/orders${suffix}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: PaymentOrder[] };
  return data.items ?? [];
}

export async function getOrder(orderId: string): Promise<PaymentOrder> {
  const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as PaymentOrder;
}

export async function getOnChain(orderId: string): Promise<OnChainDetails> {
  const res = await fetch(
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

export type MatchingModeSettings = {
  orgId: string;
  matchingMode: string;
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
  const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/matching-mode`, {
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
  const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/matching-mode`, {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ matchingMode }),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as MatchingModeSettings;
}

export async function listSettlement(orgId: string): Promise<SettlementAddress[]> {
  const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/settlement`, {
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
  const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/settlement`, {
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
  const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/xpub`, {
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
  const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/xpub`, {
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
  const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/hd-pool`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as HdPoolList;
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

export async function getServiceBillCheckout(billId: string): Promise<ServiceBillCheckout> {
  const res = await fetch(
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
  eventType: string;
  status: string;
  attempt: number;
  responseStatus?: number | null;
  createdAt?: string;
  deliveredAt?: string | null;
};

export async function listApiKeys(orgId?: string): Promise<ApiKey[]> {
  const q = orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";
  const res = await fetch(`${API_BASE}/api-keys${q}`, {
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
  orgId?: string;
}): Promise<ApiKeyCreated> {
  const res = await fetch(`${API_BASE}/api-keys`, {
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
  const res = await fetch(`${API_BASE}/api-keys/${encodeURIComponent(apiKeyId)}${q}`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok && res.status !== 204) await parseError(res);
}

export async function rotateApiKey(
  apiKeyId: string,
  body?: { expiresAt?: string | null; orgId?: string },
): Promise<ApiKeyCreated> {
  const res = await fetch(`${API_BASE}/api-keys/${encodeURIComponent(apiKeyId)}/rotate`, {
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
  const res = await fetch(`${API_BASE}/webhooks${q}`, {
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
  const res = await fetch(`${API_BASE}/webhooks`, {
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
  const res = await fetch(`${API_BASE}/webhooks/${encodeURIComponent(webhookId)}${q}`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok && res.status !== 204) await parseError(res);
}

export async function testWebhook(body?: {
  webhookId?: string;
  orgId?: string;
}): Promise<{ queued: number }> {
  const res = await fetch(`${API_BASE}/webhooks/test`, {
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
  const res = await fetch(
    `${API_BASE}/webhooks/${encodeURIComponent(webhookId)}/deliveries${q}`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: WebhookDelivery[] };
  return data.items ?? [];
}

export type OrgAccount = {
  id: string;
  type: string;
  name: string;
  parentId: string | null;
  structure?: string;
};

export type OrgMembership = {
  orgId: string;
  userId: string;
  role: string;
  orgType: string;
};

export async function listOrgs(): Promise<OrgAccount[]> {
  const res = await fetch(`${API_BASE}/orgs`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: OrgAccount[] };
  return data.items ?? [];
}

export async function getOrg(orgId: string): Promise<OrgAccount> {
  const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as OrgAccount;
}

export async function inviteOrgUser(
  orgId: string,
  body: { email: string; role: string },
): Promise<OrgMembership> {
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
  return (await res.json()) as OrgMembership;
}

export async function assignOrgUserRole(
  orgId: string,
  userId: string,
  role: string,
): Promise<OrgMembership> {
  const res = await fetch(
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

export async function createOrg(body: {
  type: string;
  name: string;
  parentId: string;
  structure?: string;
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
