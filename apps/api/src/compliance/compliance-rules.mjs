export const COMPLIANCE_OVERRIDE_TYPES = [
  "settlement_address",
  "matching_mode",
  "suspend_order_create",
  "suspend_merchant",
];

export const COMPLIANCE_REASON_CODES = [
  "manual_review",
  "suspicious_activity",
  "sanctions_screening",
  "other",
];

/**
 * @param {unknown} body
 * @returns {{
 *   ok: true,
 *   parsed: {
 *     overrideType: string,
 *     reasonCode: string,
 *     notes: string,
 *     ticketId: string | null,
 *     mfaCode: string,
 *     matchingMode: string | null,
 *     settlement: { asset: string, network: string, address: string } | null,
 *   }
 * } | { ok: false, status: number, code: string, message: string }}
 */
export function validateComplianceOverrideBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail(400, "invalid_request", "Request body must be an object");
  }

  const overrideType =
    typeof body.overrideType === "string" ? body.overrideType.trim() : "";
  if (!COMPLIANCE_OVERRIDE_TYPES.includes(overrideType)) {
    return fail(
      400,
      "invalid_request",
      "overrideType must be settlement_address, matching_mode, suspend_order_create, or suspend_merchant",
    );
  }

  const reasonCode =
    typeof body.reasonCode === "string" ? body.reasonCode.trim() : "";
  if (!COMPLIANCE_REASON_CODES.includes(reasonCode)) {
    return fail(
      400,
      "invalid_request",
      "reasonCode must be manual_review, suspicious_activity, sanctions_screening, or other",
    );
  }

  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (notes.length < 8 || notes.length > 2000) {
    return fail(
      400,
      "invalid_request",
      "notes must be 8–2000 characters",
    );
  }

  const ticketRaw = typeof body.ticketId === "string" ? body.ticketId.trim() : "";
  const ticketId = ticketRaw ? ticketRaw.slice(0, 120) : null;

  const mfaCode = typeof body.mfaCode === "string" ? body.mfaCode.trim() : "";
  if (mfaCode.length < 6 || mfaCode.length > 8) {
    return fail(400, "invalid_request", "mfaCode is required (6–8 digits)");
  }

  let matchingMode = null;
  let settlement = null;

  if (overrideType === "matching_mode") {
    const mode =
      typeof body.matchingMode === "string" ? body.matchingMode.trim() : "";
    if (!["B", "C", "D", "S"].includes(mode)) {
      return fail(400, "invalid_request", "matchingMode must be B, C, D, or S");
    }
    matchingMode = mode;
  }

  if (overrideType === "settlement_address") {
    const s = body.settlement;
    if (!s || typeof s !== "object" || Array.isArray(s)) {
      return fail(400, "invalid_request", "settlement object is required");
    }
    const asset = typeof s.asset === "string" ? s.asset.trim() : "";
    const network = typeof s.network === "string" ? s.network.trim() : "";
    const address = typeof s.address === "string" ? s.address.trim() : "";
    if (!asset || !network || !address) {
      return fail(
        400,
        "invalid_request",
        "settlement.asset, settlement.network, and settlement.address are required",
      );
    }
    if (address.length < 8 || address.length > 256) {
      return fail(400, "invalid_request", "settlement.address length is invalid");
    }
    settlement = { asset, network, address };
  }

  return {
    ok: true,
    parsed: {
      overrideType,
      reasonCode,
      notes,
      ticketId,
      mfaCode,
      matchingMode,
      settlement,
    },
  };
}

/**
 * @param {{
 *   id: string,
 *   org_id: string,
 *   actor_user_id: string,
 *   override_type: string,
 *   reason_code: string,
 *   notes: string,
 *   ticket_id: string | null,
 *   metadata: object,
 *   created_at: Date | string,
 * }} row
 */
export function toComplianceOverride(row) {
  const created =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at);
  return {
    id: row.id,
    orgId: row.org_id,
    actorUserId: row.actor_user_id,
    overrideType: row.override_type,
    reasonCode: row.reason_code,
    notes: row.notes,
    ticketId: row.ticket_id ?? null,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata
        : {},
    createdAt: created,
  };
}

function fail(status, code, message) {
  return { ok: false, status, code, message };
}
