import { randomBytes } from "node:crypto";
import { API_KEY_MAX_PER_ORG } from "@cryptogate/domain";

export { API_KEY_MAX_PER_ORG };

/**
 * Public X-Api-Key value (prefix cgk_).
 */
export function generateApiKeyId() {
  return `cgk_live_${randomBytes(12).toString("hex")}`;
}

/**
 * HMAC secret — returned once on create/rotate; never log.
 */
export function generateApiKeySecret() {
  return randomBytes(32).toString("hex");
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, expiresAt: Date | null | undefined } | { ok: false, code: string, message: string }}
 *   expiresAt undefined means "omit / keep previous" (rotate only).
 */
export function parseOptionalExpiresAt(value, { allowOmit = false } = {}) {
  if (value === undefined) {
    if (allowOmit) return { ok: true, expiresAt: undefined };
    return { ok: true, expiresAt: null };
  }
  if (value === null) return { ok: true, expiresAt: null };
  if (typeof value !== "string" || !value.trim()) {
    return {
      ok: false,
      code: "invalid_expires_at",
      message: "expiresAt must be an ISO date-time or null",
    };
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    return {
      ok: false,
      code: "invalid_expires_at",
      message: "expiresAt must be an ISO date-time or null",
    };
  }
  if (ms <= Date.now()) {
    return {
      ok: false,
      code: "invalid_expires_at",
      message: "expiresAt must be in the future",
    };
  }
  return { ok: true, expiresAt: new Date(ms) };
}

/**
 * @param {unknown} body
 */
export function validateCreateApiKeyBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, code: "invalid_request", message: "Invalid body" };
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label || label.length > 64) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "label is required (1–64 characters)",
    };
  }
  const exp = parseOptionalExpiresAt(body.expiresAt);
  if (!exp.ok) {
    return { ok: false, status: 400, code: exp.code, message: exp.message };
  }
  const orgId =
    typeof body.orgId === "string" && body.orgId.trim() ? body.orgId.trim() : null;
  return { ok: true, label, expiresAt: exp.expiresAt ?? null, orgId };
}

/**
 * @param {unknown} body
 */
export function validateRotateApiKeyBody(body) {
  if (body == null) {
    return { ok: true, expiresAt: undefined, orgId: null };
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, code: "invalid_request", message: "Invalid body" };
  }
  const exp = parseOptionalExpiresAt(body.expiresAt, {
    allowOmit: !("expiresAt" in body),
  });
  if (!exp.ok) {
    return { ok: false, status: 400, code: exp.code, message: exp.message };
  }
  const orgId =
    typeof body.orgId === "string" && body.orgId.trim() ? body.orgId.trim() : null;
  return { ok: true, expiresAt: exp.expiresAt, orgId };
}

/**
 * Public list shape — never secret.
 * @param {object} row
 */
export function toApiKey(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    keyId: row.key_id,
    label: row.label,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    lastUsedAt: row.last_used_at
      ? row.last_used_at instanceof Date
        ? row.last_used_at.toISOString()
        : String(row.last_used_at)
      : null,
    expiresAt: row.expires_at
      ? row.expires_at instanceof Date
        ? row.expires_at.toISOString()
        : String(row.expires_at)
      : null,
  };
}

/**
 * @param {object} row
 * @param {string} secret
 */
export function toApiKeyCreated(row, secret) {
  return { ...toApiKey(row), secret };
}
