import { apiFetch } from "../auth/apiFetch";
import { API_BASE, parseError } from "./apiCore";
import { requestSessionRefresh } from "./sessionRefresh";

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
  /** Own setting only; empty on sites that inherit from the merchant. */
  businessTimezone?: string | null;
  createdAt?: string;
};

export type OrgDeletePreview = {
  rootOrgId: string;
  orgCount: number;
  childOrgCount: number;
  memberCount: number;
  orderCount: number;
  billCount: number;
  orgs: Array<{ id: string; type: string; name: string; depth: number }>;
};

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
  serviceBillCreditUsd?: string;
  billingAnchorAt?: string | null;
  nextInvoiceOn?: string | null;
  /** Monthly bills still to be saved as waived (waive platform fee list). */
  waivedMonthsLeft?: number | null;
  /** On the waive activation list (activated with a waived bill at setup). */
  activationWaived?: boolean;
};

export async function listOrgs(): Promise<OrgAccount[]> {
  const res = await apiFetch(`${API_BASE}/orgs`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: OrgAccount[] };
  return data.items ?? [];
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

export async function setOrgStatus(
  orgId: string,
  status: "active" | "paused",
  opts?: { reason?: string; mfaCode?: string },
): Promise<OrgAccount> {
  const body: {
    status: "active" | "paused";
    reason?: string;
    mfaCode?: string;
  } = { status };
  const reason = opts?.reason?.trim();
  if (reason) body.reason = reason;
  const mfaCode = opts?.mfaCode?.trim();
  if (mfaCode) body.mfaCode = mfaCode;
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
    businessTimezone?: string | null;
  },
): Promise<OrgAccount> {
  const payload: Record<string, unknown> = {
    name: body.name.trim(),
    iconKey: body.iconKey ?? null,
  };
  if (body.country !== undefined) payload.country = body.country;
  if (body.legalName !== undefined) payload.legalName = body.legalName;
  if (body.billingEmail !== undefined) payload.billingEmail = body.billingEmail;
  if (body.businessTimezone !== undefined) payload.businessTimezone = body.businessTimezone;
  const res = await apiFetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseError(res);
  const updated = (await res.json()) as OrgAccount;
  requestSessionRefresh();
  return updated;
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

export async function updateMerchantCommercial(
  orgId: string,
  body: {
    tier?: string;
    volumeFeePercent?: string;
    rateMode?: "automatic" | "fixed";
    reason?: string;
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
