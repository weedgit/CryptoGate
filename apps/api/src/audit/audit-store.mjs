import { getPool } from "../db/pool.mjs";
import { sanitizeAuditMetadata } from "./audit-rules.mjs";

/**
 * Append-only insert. Callers must not pass secrets in metadata.
 * @param {{
 *   actorUserId?: string | null,
 *   orgId?: string | null,
 *   action: string,
 *   metadata?: unknown,
 * }} event
 */
export async function insertAuditEvent(event) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO audit_log (actor_user_id, org_id, action, metadata)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      event.actorUserId ?? null,
      event.orgId ?? null,
      event.action,
      JSON.stringify(sanitizeAuditMetadata(event.metadata)),
    ],
  );
}
