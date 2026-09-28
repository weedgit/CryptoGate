import { MatchingMode, getAssetNetworkConfig, AssetCode, NetworkId } from "@paymentgate/domain";
import { validateMatchingSettings } from "@paymentgate/matching";

const MERCHANT_TYPES = new Set(["merchant", "merchant_site"]);
const ALLOWED_MODES = new Set(Object.values(MatchingMode));

/** Phase 1 default when the merchant has not set a mode. */
export const DEFAULT_MATCHING_MODE = MatchingMode.B;
/** Underpay tolerance is retired: payments must match the exact amount. */
export const DEFAULT_UNDERPAY_TOLERANCE = "0";

/**
 * @param {string} orgType
 */
export function matchingModeAllowedOnOrgType(orgType) {
  return MERCHANT_TYPES.has(orgType);
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, parsed: { matchingMode: string, underpayTolerance: string } } | { ok: false, status: number, code: string, message: string }}
 */
export function validateMatchingModeBody(body) {
  const matchingMode =
    typeof body?.matchingMode === "string" ? body.matchingMode.trim() : "";
  const rawTolerance = body?.underpayTolerance;
  const underpayTolerance =
    rawTolerance == null ? DEFAULT_UNDERPAY_TOLERANCE : String(rawTolerance).trim();

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
      message: "matchingMode must be one of B, C, S",
    };
  }
  if (!/^0+(\.0+)?$/.test(underpayTolerance)) {
    return {
      ok: false,
      status: 400,
      code: "underpay_tolerance_unsupported",
      message: "Underpay tolerance is not supported — payments must match the exact amount",
    };
  }

  const cfg = getAssetNetworkConfig(AssetCode.USDT, NetworkId.Tron);
  const policy = validateMatchingSettings({
    mode: matchingMode,
    underpayTolerance: DEFAULT_UNDERPAY_TOLERANCE,
    amountStep: cfg?.amountStep,
    decimals: cfg?.decimals,
  });
  if (!policy.ok) {
    return {
      ok: false,
      status: 400,
      code: policy.code,
      message: policy.message,
    };
  }

  return {
    ok: true,
    parsed: { matchingMode, underpayTolerance: DEFAULT_UNDERPAY_TOLERANCE },
  };
}

/**
 * @param {{ org_id: string, matching_mode: string, underpay_tolerance?: string } | null} row
 * @param {string} orgId
 */
export function toMatchingModeSettings(row, orgId, lookup = {}) {
  return {
    orgId,
    matchingMode: row?.matching_mode ?? DEFAULT_MATCHING_MODE,
    underpayTolerance: DEFAULT_UNDERPAY_TOLERANCE,
    source: lookup.source ?? "merchant",
    parentOrgId: lookup.parentOrgId ?? null,
    effectiveOrgId: lookup.orgId ?? orgId,
  };
}
