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
  receiveAddress: string;
  asset: string;
  network: string;
  expiresAt: string;
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
