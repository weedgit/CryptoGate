import { MerchantTier, PricingRateMode } from "@paymentgate/domain";
import {
  isPercentWithinBand,
  nextBillingPeriodStart,
} from "../platform-settings/fee-tier-rules.mjs";
import { findFeeTierBand } from "../platform-settings/fee-tier-store.mjs";
import { agentCommissionEffectiveFromToday } from "./agent-commission-rules.mjs";

/**
 * @param {object} body
 * @param {string} currentTier
 */
export function validateUpdateMerchantCommercialBody(body, currentTier) {
  if (!body || typeof body !== "object") {
    return fail(400, "invalid_request", "Request body required");
  }
  const tier =
    body.tier === undefined || body.tier === null
      ? currentTier
      : String(body.tier);
  if (!Object.values(MerchantTier).includes(tier)) {
    return fail(400, "invalid_request", "Invalid tier");
  }
  const rateModeRaw =
    typeof body.rateMode === "string" ? body.rateMode.trim() : "";
  const rateMode =
    rateModeRaw === PricingRateMode.Fixed || rateModeRaw === "fixed"
      ? PricingRateMode.Fixed
      : rateModeRaw === PricingRateMode.Automatic || rateModeRaw === "automatic"
        ? PricingRateMode.Automatic
        : rateModeRaw
          ? null
          : undefined;
  if (rateModeRaw && rateMode === null) {
    return fail(400, "invalid_request", "rateMode must be automatic or fixed");
  }
  const volumeFeePercent =
    typeof body.volumeFeePercent === "string"
      ? body.volumeFeePercent.trim()
      : "";
  if (!volumeFeePercent && rateMode !== PricingRateMode.Automatic) {
    return fail(400, "invalid_request", "volumeFeePercent is required");
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : undefined;
  return {
    ok: true,
    tier,
    volumeFeePercent: volumeFeePercent || null,
    rateMode,
    reason,
  };
}

/**
 * @param {string} tier
 * @param {string} volumeFeePercent
 * @param {object} bandRow
 */
export function commercialNeedsEnterpriseApproval(tier, volumeFeePercent, bandRow) {
  if (tier !== MerchantTier.Enterprise) return false;
  return !isPercentWithinBand(volumeFeePercent, bandRow);
}

/**
 * @param {string} tier
 * @param {string} volumeFeePercent
 * @param {object} bandRow
 * @param {"automatic" | "fixed"} [rateMode]
 */
export function validateCommercialAgainstBand(
  tier,
  volumeFeePercent,
  bandRow,
  rateMode = "automatic",
) {
  if (!bandRow) {
    return fail(422, "invalid_band", "Tier band not configured");
  }
  // Fixed Owner overrides may sit outside the published band.
  if (rateMode === "fixed") {
    return { ok: true, needsApproval: false };
  }
  if (tier === MerchantTier.Enterprise) {
    return {
      ok: true,
      needsApproval: !isPercentWithinBand(volumeFeePercent, bandRow),
    };
  }
  if (!isPercentWithinBand(volumeFeePercent, bandRow)) {
    return fail(
      422,
      "rate_outside_band",
      "volumeFeePercent must fall within the platform band for this tier",
    );
  }
  return { ok: true, needsApproval: false };
}

/**
 * @param {object} row
 * @param {object} bandRow
 * @param {string | null} pendingApprovalStatus
 */
export function toMerchantCommercialSettings(row, bandRow, pendingApprovalStatus = null) {
  const effectiveFrom =
    row.effective_from instanceof Date
      ? row.effective_from.toISOString().slice(0, 10)
      : String(row.effective_from).slice(0, 10);
  return {
    orgId: row.org_id,
    tier: row.tier,
    volumeFeePercent: row.volume_fee_percent,
    rateMode: row.rate_mode === "fixed" ? "fixed" : "automatic",
    subscriptionAmountUsd: bandRow.subscription_amount_usd,
    bandMinPercent: bandRow.volume_fee_min_percent,
    bandMaxPercent: bandRow.volume_fee_max_percent,
    effectiveFrom,
    ...(row.pending_volume_fee_percent
      ? { pendingVolumeFeePercent: row.pending_volume_fee_percent }
      : {}),
    ...(pendingApprovalStatus
      ? { enterpriseApprovalStatus: pendingApprovalStatus }
      : row.enterprise_approval_status
        ? { enterpriseApprovalStatus: row.enterprise_approval_status }
        : {}),
  };
}

/**
 * @param {string} tier
 * @param {string} volumeFeePercent
 */
export async function validateCommercialOnCreate(tier, volumeFeePercent) {
  const bandRow = await findFeeTierBand(tier);
  return validateCommercialAgainstBand(tier, volumeFeePercent, bandRow);
}

export { nextBillingPeriodStart };

/** Month start for audit/display when a merchant rate changes immediately. */
export function merchantCommercialEffectiveFromToday() {
  return agentCommissionEffectiveFromToday();
}

function fail(status, code, message) {
  return { ok: false, status, code, message };
}
