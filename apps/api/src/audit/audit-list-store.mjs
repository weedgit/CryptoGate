import { getPool } from "../db/pool.mjs";
import { sanitizeAuditMetadata } from "./audit-rules.mjs";

/**
 * @param {{
 *   kind: "all" | "filter",
 *   orgIds?: string[],
 *   from?: string | null,
 *   to?: string | null,
 *   actorUserId?: string | null,
 *   orgId?: string | null,
 *   action?: string | null,
 *   limit?: number,
 * }} query
 */
export async function listAuditLog(query) {
  const params = [];
  /** @type {string[]} */
  const where = [];

  if (query.kind === "filter") {
    if (!query.orgIds || query.orgIds.length === 0) return [];
    params.push(query.orgIds);
    where.push(`org_id = ANY($${params.length}::uuid[])`);
  }
  if (query.orgId) {
    params.push(query.orgId);
    where.push(`org_id = $${params.length}::uuid`);
  }
  if (query.actorUserId) {
    params.push(query.actorUserId);
    where.push(`actor_user_id = $${params.length}::uuid`);
  }
  if (query.action) {
    params.push(query.action);
    where.push(`action = $${params.length}`);
  }
  if (query.from) {
    params.push(query.from);
    where.push(`created_at >= $${params.length}::timestamptz`);
  }
  if (query.to) {
    params.push(query.to);
    where.push(`created_at <= $${params.length}::timestamptz`);
  }

  const limit = query.limit ?? 100;
  params.push(limit);

  const { rows } = await getPool().query(
    `SELECT id, actor_user_id, org_id, action, metadata, created_at
     FROM audit_log
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params,
  );

  return rows.map((row) => ({
    ...row,
    metadata: sanitizeAuditMetadata(row.metadata),
  }));
}
