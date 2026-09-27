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
  const reason = typeof body.reason === "string" ? body.reason.trim() : undefined;

  const flags = parseMerchantBillingFlagsBody(body);
  if (flags.ok === false) {
    return flags;
  }

  const flagsOnly =
    flags.hasBillingFlags &&
    rateMode === undefined &&
    !volumeFeePercent &&
    (body.tier === undefined || body.tier === null);

  if (!volumeFeePercent && rateMode !== PricingRateMode.Automatic && !flagsOnly) {
    return fail(400, "invalid_request", "volumeFeePercent is required");
  }

  return {
    ok: true,
    tier,
    volumeFeePercent: volumeFeePercent || null,
    rateMode,
    reason,
    serviceBillCreditUsd: flags.serviceBillCreditUsd,
    hasBillingFlags: flags.hasBillingFlags,
    flagsOnly,
  };
}

const AMOUNT_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

/**
 * Waivers live on the Service Bills waive lists, not on commercial settings.
 * @param {object} body
 * @returns {{
 *   ok: true,
 *   hasBillingFlags: boolean,
 *   serviceBillCreditUsd?: string,
 * } | { ok: false, status: number, code: string, message: string }}
 */
export function parseMerchantBillingFlagsBody(body) {
  /** @type {{ ok: true, hasBillingFlags: boolean, serviceBillCreditUsd?: string }} */
  const out = { ok: true, hasBillingFlags: false };
  if (body.serviceBillCreditUsd !== undefined) {
    out.hasBillingFlags = true;
    if (
      typeof body.serviceBillCreditUsd !== "string" ||
      !AMOUNT_RE.test(body.serviceBillCreditUsd.trim())
    ) {
      return fail(
        400,
        "invalid_request",
        "serviceBillCreditUsd must be a USD decimal string",
      );
    }
    out.serviceBillCreditUsd = body.serviceBillCreditUsd.trim();
  }
  return out;
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
    return { ok: true };
  }
  // Enterprise bands are custom; the Owner sets a Fixed rate when needed.
  if (tier === MerchantTier.Enterprise) {
    return { ok: true };
  }
  if (!isPercentWithinBand(volumeFeePercent, bandRow)) {
    return fail(
      422,
      "rate_outside_band",
      "volumeFeePercent must fall within the platform band for this tier",
    );
  }
  return { ok: true };
}

/**
 * @param {object} row
 * @param {object} bandRow
 * @param {{ waivedMonthsLeft: number | null, activationWaived: boolean }} [waivers]
 */
export function toMerchantCommercialSettings(row, bandRow, waivers) {
  const effectiveFrom =
    row.effective_from instanceof Date
      ? row.effective_from.toISOString().slice(0, 10)
      : String(row.effective_from).slice(0, 10);
  /** @type {Record<string, unknown>} */
  const out = {
    orgId: row.org_id,
    tier: row.tier,
    volumeFeePercent: row.volume_fee_percent,
    rateMode: row.rate_mode === "fixed" ? "fixed" : "automatic",
    subscriptionAmountUsd: bandRow.subscription_amount_usd,
    bandMinPercent: bandRow.volume_fee_min_percent,
    bandMaxPercent: bandRow.volume_fee_max_percent,
    effectiveFrom,
    serviceBillCreditUsd: String(row.service_bill_credit_usd ?? "0.00"),
    billingAnchorAt: row.billing_anchor_at
      ? row.billing_anchor_at instanceof Date
        ? row.billing_anchor_at.toISOString()
        : String(row.billing_anchor_at)
      : null,
    nextInvoiceOn: row.next_invoice_on
      ? row.next_invoice_on instanceof Date
        ? row.next_invoice_on.toISOString().slice(0, 10)
        : String(row.next_invoice_on).slice(0, 10)
      : null,
    waivedMonthsLeft: waivers?.waivedMonthsLeft ?? null,
    activationWaived: waivers?.activationWaived ?? false,
  };
  if (row.pending_volume_fee_percent) {
    out.pendingVolumeFeePercent = row.pending_volume_fee_percent;
  }
  return out;
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
