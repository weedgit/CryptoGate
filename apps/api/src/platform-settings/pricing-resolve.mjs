/**
 * Resolve effective merchant / agent rates from schedule vs fixed overrides.
 */
import { MerchantTier } from "@paymentgate/domain";
import {
  findMerchantCommercial,
  applyMerchantCommercialImmediate,
} from "../commercial/merchant-commercial-store.mjs";
import {
  findAgentCommission,
  upsertAgentCommission,
} from "../commercial/agent-commission-store.mjs";
import {
  findFeeTierBand,
  listFeeTierBands,
  toFeeTierBand,
} from "./fee-tier-store.mjs";
import { resolveTierForVolume } from "./fee-tier-rules.mjs";

/**
 * Default bootstrap for a new merchant: Mid schedule automatic rate.
 */
export async function defaultMerchantSchedulePlan() {
  const band =
    (await findFeeTierBand(MerchantTier.Mid)) ??
    (await findFeeTierBand(MerchantTier.Small));
  const tier = band?.tier ?? MerchantTier.Mid;
  const live = band ? toFeeTierBand(band) : null;
  return {
    tier,
    volumeFeePercent:
      live?.defaultSignupPercent ??
      band?.default_signup_percent ??
      "1.2",
    rateMode: "automatic",
  };
}

/**
 * Default bootstrap for a new agent: Mid schedule commission %.
 */
export async function defaultAgentSchedulePlan() {
  const band =
    (await findFeeTierBand(MerchantTier.Mid)) ??
    (await findFeeTierBand(MerchantTier.Small));
  const live = band ? toFeeTierBand(band) : null;
  return {
    commissionPercent:
      live?.agentCommissionPercent ??
      band?.agent_commission_percent ??
      "15",
    rateMode: "automatic",
  };
}

/**
 * For bill generation: if automatic, refresh tier + fee from volume; if fixed, keep stored %.
 * @param {string} orgId
 * @param {number} billedVolumeUsd
 */
export async function resolveMerchantRatesForBilling(orgId, billedVolumeUsd) {
  const commercial = await findMerchantCommercial(orgId);
  if (!commercial) return null;

  const rateMode = commercial.rate_mode === "fixed" ? "fixed" : "automatic";
  if (rateMode === "fixed") {
    const band = await findFeeTierBand(commercial.tier);
    return {
      tier: commercial.tier,
      volumeFeePercent: String(commercial.volume_fee_percent),
      subscriptionAmountUsd: band?.subscription_amount_usd ?? "0",
      rateMode,
      commercial,
      band,
    };
  }

  const bands = await listFeeTierBands();
  const tier = resolveTierForVolume(billedVolumeUsd, bands);
  const band = bands.find((b) => b.tier === tier) ?? (await findFeeTierBand(tier));
  if (!band) return null;
  const live = toFeeTierBand(band);
  const volumeFeePercent = live.defaultSignupPercent;

  if (
    commercial.tier !== tier ||
    String(commercial.volume_fee_percent) !== String(volumeFeePercent)
  ) {
    await applyMerchantCommercialImmediate(orgId, {
      tier,
      volumeFeePercent,
      rateMode: "automatic",
    });
  }

  return {
    tier,
    volumeFeePercent,
    subscriptionAmountUsd: live.subscriptionAmountUsd,
    rateMode: "automatic",
    commercial,
    band,
  };
}

/**
 * For commission generation: fixed uses stored %; automatic uses schedule for
 * the agent's current/default Mid band (or optional volumeTier when provided).
 * @param {string} orgId
 * @param {{ volumeUsd?: number }} [opts]
 */
export async function resolveAgentCommissionForPayout(orgId, opts = {}) {
  const row = await findAgentCommission(orgId);
  const rateMode = row?.rate_mode === "fixed" ? "fixed" : "automatic";

  if (rateMode === "fixed" && row) {
    return {
      commissionPercent: String(row.commission_percent),
      rateMode,
      row,
    };
  }

  const bands = await listFeeTierBands();
  const volumeUsd =
    typeof opts.volumeUsd === "number" && Number.isFinite(opts.volumeUsd)
      ? opts.volumeUsd
      : 0;
  const tier = resolveTierForVolume(volumeUsd, bands);
  const band = bands.find((b) => b.tier === tier) ?? (await findFeeTierBand(tier));
  const live = band ? toFeeTierBand(band) : null;
  const commissionPercent = live?.agentCommissionPercent ?? "15";

  if (!row || String(row.commission_percent) !== String(commissionPercent)) {
    await upsertAgentCommission({
      orgId,
      commissionPercent,
      rateMode: "automatic",
    });
  }

  return {
    commissionPercent,
    rateMode: "automatic",
    tier,
    row,
  };
}
