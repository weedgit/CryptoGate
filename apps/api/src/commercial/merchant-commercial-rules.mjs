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
    feeExemptUntil: flags.feeExemptUntil,
    skipActivation: flags.skipActivation,
    billingOpsNote: flags.billingOpsNote,
    serviceBillCreditUsd: flags.serviceBillCreditUsd,
    hasBillingFlags: flags.hasBillingFlags,
    flagsOnly,
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

/**
 * @param {object} body
 * @returns {{
 *   ok: true,
 *   hasBillingFlags: boolean,
 *   feeExemptUntil?: string | null,
 *   skipActivation?: boolean,
 *   billingOpsNote?: string | null,
 *   serviceBillCreditUsd?: string,
 * } | { ok: false, status: number, code: string, message: string }}
 */
export function parseMerchantBillingFlagsBody(body) {
  /** @type {{
   *   ok: true,
   *   hasBillingFlags: boolean,
   *   feeExemptUntil?: string | null,
   *   skipActivation?: boolean,
   *   billingOpsNote?: string | null,
   *   serviceBillCreditUsd?: string,
   * }} */
  const out = { ok: true, hasBillingFlags: false };
  if (body.feeExemptUntil !== undefined) {
    out.hasBillingFlags = true;
    if (body.feeExemptUntil === null || body.feeExemptUntil === "") {
      out.feeExemptUntil = null;
    } else if (
      typeof body.feeExemptUntil === "string" &&
      DATE_RE.test(body.feeExemptUntil.trim())
    ) {
      out.feeExemptUntil = body.feeExemptUntil.trim();
    } else {
      return fail(400, "invalid_request", "feeExemptUntil must be YYYY-MM-DD or null");
    }
  }
  if (body.skipActivation !== undefined) {
    out.hasBillingFlags = true;
    if (typeof body.skipActivation !== "boolean") {
      return fail(400, "invalid_request", "skipActivation must be a boolean");
    }
    out.skipActivation = body.skipActivation;
  }
  if (body.billingOpsNote !== undefined) {
    out.hasBillingFlags = true;
    if (body.billingOpsNote === null) {
      out.billingOpsNote = null;
    } else if (typeof body.billingOpsNote === "string") {
      const n = body.billingOpsNote.trim();
      if (n.length > 1000) {
        return fail(400, "invalid_request", "billingOpsNote max 1000 chars");
      }
      out.billingOpsNote = n || null;
    } else {
      return fail(400, "invalid_request", "billingOpsNote must be a string or null");
    }
  }
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
    skipActivation: Boolean(row.skip_activation),
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
  };
  if (row.fee_exempt_until) {
    out.feeExemptUntil =
      row.fee_exempt_until instanceof Date
        ? row.fee_exempt_until.toISOString().slice(0, 10)
        : String(row.fee_exempt_until).slice(0, 10);
  } else {
    out.feeExemptUntil = null;
  }
  if (row.billing_ops_note) {
    out.billingOpsNote = String(row.billing_ops_note);
  } else {
    out.billingOpsNote = null;
  }
  if (row.pending_volume_fee_percent) {
    out.pendingVolumeFeePercent = row.pending_volume_fee_percent;
  }
  if (pendingApprovalStatus) {
    out.enterpriseApprovalStatus = pendingApprovalStatus;
  } else if (row.enterprise_approval_status) {
    out.enterpriseApprovalStatus = row.enterprise_approval_status;
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
