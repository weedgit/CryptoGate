import {
  ApiError,
  getSession,
  login,
  logout,
  listOrders,
  type PaymentOrder,
  type Session,
} from "../merchant/api";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  "/v1";

export { ApiError, getSession, login, logout, listOrders };
export type { PaymentOrder, Session };

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
};

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
  const res = await fetch(`${API_BASE}/platform/settings/fee-tiers`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as { tiers: FeeTierBand[]; updatedAt: string };
}

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

export async function createOrg(body: {
  type: string;
  name: string;
  parentId: string;
  structure?: string;
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
