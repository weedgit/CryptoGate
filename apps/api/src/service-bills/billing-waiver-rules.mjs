export const FEE_WAIVER_MAX_MONTHS = 120;
const REASON_MAX = 500;

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: string } | { ok: false, status: number, code: string, message: string }}
 */
function parseReason(raw) {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (!reason || reason.length > REASON_MAX) {
    return fail(`reason is required (max ${REASON_MAX} chars)`);
  }
  return { ok: true, value: reason };
}

/**
 * PUT /v1/billing-waivers/fee/{orgId} body.
 * @param {unknown} body
 */
export function validateFeeWaiverBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail("Invalid body");
  }
  const monthsLeft = /** @type {{ monthsLeft?: unknown }} */ (body).monthsLeft;
  if (
    typeof monthsLeft !== "number" ||
    !Number.isInteger(monthsLeft) ||
    monthsLeft < 1 ||
    monthsLeft > FEE_WAIVER_MAX_MONTHS
  ) {
    return fail(`monthsLeft must be an integer 1–${FEE_WAIVER_MAX_MONTHS}`);
  }
  const reason = parseReason(/** @type {{ reason?: unknown }} */ (body).reason);
  if (reason.ok === false) return reason;
  return { ok: true, monthsLeft, reason: reason.value };
}

/**
 * PUT /v1/billing-waivers/activation/{orgId} body.
 * @param {unknown} body
 */
export function validateActivationWaiverBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail("Invalid body");
  }
  const reason = parseReason(/** @type {{ reason?: unknown }} */ (body).reason);
  if (reason.ok === false) return reason;
  return { ok: true, reason: reason.value };
}

/**
 * Close reason on a monthly bill saved as waived from the list.
 * @param {{ months_used: number, months_granted: number, reason: string }} waiver row before consuming
 */
export function feeWaiverCloseReason(waiver) {
  const nth = Number(waiver.months_used) + 1;
  return `Waived ${nth} of ${Number(waiver.months_granted)} — ${waiver.reason}`;
}

/**
 * @param {{ reason: string }} waiver
 */
export function activationWaiverCloseReason(waiver) {
  return `Activation waived — ${waiver.reason}`;
}

/**
 * @param {object} row
 */
export function toFeeWaiver(row) {
  const granted = Number(row.months_granted);
  const used = Number(row.months_used);
  return {
    orgId: row.org_id,
    orgName: row.org_name ?? null,
    monthsLeft: granted - used,
    monthsGranted: granted,
    monthsUsed: used,
    reason: row.reason,
    createdAt: isoOrNull(row.created_at),
    updatedAt: isoOrNull(row.updated_at),
  };
}

/**
 * @param {object} row
 */
export function toActivationWaiver(row) {
  return {
    orgId: row.org_id,
    orgName: row.org_name ?? null,
    reason: row.reason,
    createdAt: isoOrNull(row.created_at),
    updatedAt: isoOrNull(row.updated_at),
  };
}

function isoOrNull(v) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

function fail(message) {
  return { ok: false, status: 400, code: "invalid_request", message };
}
