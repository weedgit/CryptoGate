import type { AuditLogEntry } from "../platform/api";
import {
  getServerBlob,
  getServerJson,
  peekServerJson,
  toServerPage,
  type ServerPage,
  type ServerParams,
} from "./serverListApi";

export type AuditListParams = {
  from?: string;
  to?: string;
  action?: string;
  orgId?: string;
  actorUserId?: string;
  q?: string;
  /** Action codes whose UI label matched `q`. */
  qActions?: string[];
  limit: number;
  offset: number;
};

type AuditListResponse = {
  items?: AuditLogEntry[];
  total?: number;
  limit?: number;
  offset?: number;
};

const PATH = "/audit";

function params(p: AuditListParams): ServerParams {
  return {
    from: p.from,
    to: p.to,
    action: p.action,
    orgId: p.orgId,
    actorUserId: p.actorUserId,
    q: p.q?.trim() || undefined,
    qActions: p.q?.trim() && p.qActions?.length ? p.qActions.join(",") : undefined,
    limit: p.limit,
    offset: p.offset,
  };
}

/** One newest-first page of audit events with the filtered total (server search). */
export async function listAuditLogServer(
  p: AuditListParams,
): Promise<ServerPage<AuditLogEntry>> {
  return toServerPage(await getServerJson<AuditListResponse>(PATH, params(p)), p.limit);
}

export function peekAuditLogServer(p: AuditListParams): ServerPage<AuditLogEntry> | null {
  const data = peekServerJson<AuditListResponse>(PATH, params(p));
  return data ? toServerPage(data, p.limit) : null;
}

/** CSV of every matching event, built and streamed by the server (no row cap). */
export async function downloadAuditLogCsv(
  p: Omit<AuditListParams, "limit" | "offset">,
): Promise<Blob> {
  const { limit: _limit, offset: _offset, ...filters } = params({ ...p, limit: 0, offset: 0 });
  return getServerBlob(`${PATH}/export`, filters);
}
