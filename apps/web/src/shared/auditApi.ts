import { apiFetch } from "../auth/apiFetch";
import { API_BASE, parseError } from "./apiCore";

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
