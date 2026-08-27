import { nextBillingPeriodStart } from "../platform-settings/fee-tier-rules.mjs";

export const DEFAULT_AGENT_COMMISSION_PERCENT = "15";
export const AGENT_COMMISSION_MIN = 0;
export const AGENT_COMMISSION_MAX = 100;

/**
 * @param {number} status
 * @param {string} code
 * @param {string} message
 */
function fail(status, code, message) {
  return { ok: false, status, code, message };
}

/**
 * @param {unknown} raw
 */
export function parseCommissionPercent(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  if (n < AGENT_COMMISSION_MIN || n > AGENT_COMMISSION_MAX) return null;
  // Normalize to a short decimal string without trailing zeros noise.
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

/**
 * @param {unknown} body
 */
export function validateUpdateAgentCommissionBody(body) {
  if (!body || typeof body !== "object") {
    return fail(400, "invalid_request", "Request body required");
  }
  const commissionPercent = parseCommissionPercent(body.commissionPercent);
  if (commissionPercent === null) {
    return fail(
      422,
      "invalid_commission",
      `commissionPercent must be a number from ${AGENT_COMMISSION_MIN} to ${AGENT_COMMISSION_MAX}`,
    );
  }
  return { ok: true, commissionPercent };
}

/**
 * @param {object} row
 */
export function toAgentCommissionSettings(row) {
  const effectiveFrom =
    row.effective_from instanceof Date
      ? row.effective_from.toISOString().slice(0, 10)
      : String(row.effective_from).slice(0, 10);
  return {
    orgId: row.org_id,
    commissionPercent: row.commission_percent,
    effectiveFrom,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at
          ? String(row.updated_at)
          : undefined,
  };
}

export function agentCommissionAllowedOnOrgType(type) {
  return type === "agent" || type === "agent_sub";
}

/** Month boundary for audit/display when rate changes immediately. */
export function agentCommissionEffectiveFromToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

export { nextBillingPeriodStart };
