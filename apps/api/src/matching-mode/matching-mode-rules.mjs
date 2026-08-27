import { MatchingMode } from "@cryptogate/domain";

const MERCHANT_TYPES = new Set(["merchant", "merchant_site"]);
const ALLOWED_MODES = new Set(Object.values(MatchingMode));

/** Phase 1 default when the merchant has not set a mode. */
export const DEFAULT_MATCHING_MODE = MatchingMode.B;

/**
 * @param {string} orgType
 */
export function matchingModeAllowedOnOrgType(orgType) {
  return MERCHANT_TYPES.has(orgType);
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, parsed: { matchingMode: string } } | { ok: false, status: number, code: string, message: string }}
 */
export function validateMatchingModeBody(body) {
  const matchingMode =
    typeof body?.matchingMode === "string" ? body.matchingMode.trim() : "";

  if (!matchingMode) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "matchingMode is required",
    };
  }
  if (!ALLOWED_MODES.has(matchingMode)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_matching_mode",
      message: "matchingMode must be one of B, C, D, S",
    };
  }

  return { ok: true, parsed: { matchingMode } };
}

/**
 * @param {{ org_id: string, matching_mode: string } | null} row
 * @param {string} orgId
 */
export function toMatchingModeSettings(row, orgId, lookup = {}) {
  return {
    orgId,
    matchingMode: row?.matching_mode ?? DEFAULT_MATCHING_MODE,
    source: lookup.source ?? "merchant",
    parentOrgId: lookup.parentOrgId ?? null,
    effectiveOrgId: lookup.orgId ?? orgId,
  };
}
