import { AuditAction } from "@paymentgate/domain";

const AUDIT_ACTIONS = new Set(Object.values(AuditAction));

/**
 * @param {string | null} raw
 */
export function parseAuditActionFilter(raw) {
  if (raw == null || raw === "") return { ok: true, action: null };
  if (!AUDIT_ACTIONS.has(raw)) {
    return { ok: false, status: 400, code: "invalid_request", message: "Invalid action" };
  }
  return { ok: true, action: raw };
}

/**
 * @param {string | null} raw
 */
export function parseAuditLimit(raw) {
  if (raw == null || raw === "") return { ok: true, limit: 100 };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 500) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "limit must be 1–500",
    };
  }
  return { ok: true, limit: n };
}

/**
 * @param {string | null} raw
 * @param {string} name
 */
export function parseIsoDateTimeFilter(raw, name) {
  if (raw == null || raw === "") return { ok: true, value: null };
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `${name} must be an ISO date-time`,
    };
  }
  return { ok: true, value: new Date(ms).toISOString() };
}

/**
 * @param {object} row
 */
export function toAuditLogEntry(row) {
  /** @type {Record<string, string | number | boolean | null>} */
  let metadata = {};
  if (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)) {
    metadata = row.metadata;
  }
  /** @type {{
   *   id: string,
   *   actorUserId: string | null,
   *   orgId: string | null,
   *   action: string,
   *   metadata: Record<string, string | number | boolean | null>,
   *   createdAt: string,
   *   actorEmail?: string,
   *   actorDisplayName?: string,
   * }} */
  const entry = {
    id: row.id,
    actorUserId: row.actor_user_id ?? null,
    orgId: row.org_id ?? null,
    action: row.action,
    metadata,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
  if (typeof row.actor_email === "string" && row.actor_email.trim()) {
    entry.actorEmail = row.actor_email.trim();
  }
  if (
    typeof row.actor_display_name === "string" &&
    row.actor_display_name.trim()
  ) {
    entry.actorDisplayName = row.actor_display_name.trim();
  }
  return entry;
}
