import { apiFetch } from "../auth/apiFetch";
import { API_BASE, parseError } from "./apiCore";

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
  opsNote?: string | null;
  creditAppliedUsd?: string | null;
  tier?: string | null;
  volumeFeePercent?: string | null;
  billedVolumeUsd?: string | null;
  paidAt?: string | null;
  cancelledAt?: string | null;
  waivedAt?: string | null;
  closeReason?: string | null;
  lastAdjustmentReason?: string | null;
  lastAdjustmentAmount?: string | null;
  paymentReference?: string | null;
  rxAddress?: string | null;
  remittancePayTo?: string | null;
  invoiceSeller?: { name: string; email: string | null; phone?: string | null };
  txAddress?: string | null;
  createdAt?: string | null;
};

export type ServiceBillListPage = {
  items: ServiceBill[];
  total: number;
  limit: number;
  offset: number;
};

/** Platform agent detail needs the full load-test bill set (not the API default 100). */
export const SERVICE_BILLS_LIST_LIMIT = 5000;

export async function getServiceBill(billId: string): Promise<ServiceBill> {
  const res = await apiFetch(`${API_BASE}/service-bills/${encodeURIComponent(billId)}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ServiceBill;
}

export async function listServiceBillsPage(opts?: {
  status?: string;
  orgId?: string;
  limit?: number;
  offset?: number;
}): Promise<ServiceBillListPage> {
  const q = new URLSearchParams();
  if (opts?.status) q.set("status", opts.status);
  if (opts?.orgId) q.set("orgId", opts.orgId);
  const limit = opts?.limit ?? SERVICE_BILLS_LIST_LIMIT;
  q.set("limit", String(limit));
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
    limit: data.limit ?? limit,
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
