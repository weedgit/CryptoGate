import { MerchantTier } from "@cryptogate/domain";
import {
  isPercentWithinBand,
  nextBillingPeriodStart,
} from "../platform-settings/fee-tier-rules.mjs";
import { findFeeTierBand } from "../platform-settings/fee-tier-store.mjs";

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
  const volumeFeePercent =
    typeof body.volumeFeePercent === "string"
      ? body.volumeFeePercent.trim()
      : "";
  if (!volumeFeePercent) {
    return fail(400, "invalid_request", "volumeFeePercent is required");
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : undefined;
  return { ok: true, tier, volumeFeePercent, reason };
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
 */
export function validateCommercialAgainstBand(tier, volumeFeePercent, bandRow) {
  if (!bandRow) {
    return fail(422, "invalid_band", "Tier band not configured");
  }
  if (tier === MerchantTier.Enterprise) {
    return { ok: true, needsApproval: !isPercentWithinBand(volumeFeePercent, bandRow) };
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

function fail(status, code, message) {
  return { ok: false, status, code, message };
}
