import { getPool } from "../db/pool.mjs";
import {
  ALLOWED_QUOTE_LOCK_SECONDS,
  DEFAULT_DEPEG_THRESHOLD_BPS,
  DEFAULT_QUOTE_LOCK_SECONDS,
  PricingMode,
} from "@paymentgate/domain";
import {
  DEFAULT_MIN_RATE_SOURCES,
  DEFAULT_RATE_VENUES,
  DEFAULT_REFERENCE_DEVIATION_BPS,
  RATE_VENUES,
} from "./usd-price.mjs";

const DEFAULT_PLATFORM = {
  ratesEnabled: true,
  modePegged1to1Enabled: true,
  modeMarketEnabled: true,
  depegThresholdBps: DEFAULT_DEPEG_THRESHOLD_BPS,
  allowedQuoteLockSeconds: [...ALLOWED_QUOTE_LOCK_SECONDS],
  minRateSources: DEFAULT_MIN_RATE_SOURCES,
  rateVenues: [...DEFAULT_RATE_VENUES],
  chainlinkReferenceEnabled: false,
  referenceDeviationBps: DEFAULT_REFERENCE_DEVIATION_BPS,
};

/**
 * @returns {Promise<typeof DEFAULT_PLATFORM & { updatedAt?: string }>}
 */
export async function getPlatformPricingSettings() {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT rates_enabled, mode_pegged_1to1_enabled, mode_market_enabled,
              depeg_threshold_bps, allowed_quote_lock_seconds, updated_at,
              min_rate_sources, rate_venues, chainlink_reference_enabled,
              reference_deviation_bps
         FROM platform_pricing_settings
        WHERE id = 1`,
    );
    const row = rows[0];
    if (!row) return { ...DEFAULT_PLATFORM };
    return {
      ratesEnabled: Boolean(row.rates_enabled),
      modePegged1to1Enabled: Boolean(row.mode_pegged_1to1_enabled),
      modeMarketEnabled: Boolean(row.mode_market_enabled),
      depegThresholdBps: Number(row.depeg_threshold_bps) || DEFAULT_DEPEG_THRESHOLD_BPS,
      allowedQuoteLockSeconds: Array.isArray(row.allowed_quote_lock_seconds)
        ? row.allowed_quote_lock_seconds.map(Number)
        : [...ALLOWED_QUOTE_LOCK_SECONDS],
      minRateSources:
        Number(row.min_rate_sources) || DEFAULT_MIN_RATE_SOURCES,
      rateVenues: Array.isArray(row.rate_venues) && row.rate_venues.length
        ? row.rate_venues.map(String)
        : [...DEFAULT_RATE_VENUES],
      chainlinkReferenceEnabled: Boolean(row.chainlink_reference_enabled),
      referenceDeviationBps:
        Number(row.reference_deviation_bps) || DEFAULT_REFERENCE_DEVIATION_BPS,
      updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
    };
  } catch (err) {
    if (/platform_pricing_settings|does not exist|column/i.test(err?.message ?? "")) {
      return { ...DEFAULT_PLATFORM };
    }
    throw err;
  }
}

/**
 * @param {Partial<typeof DEFAULT_PLATFORM>} patch
 */
export async function updatePlatformPricingSettings(patch) {
  const cur = await getPlatformPricingSettings();
  const next = {
    ratesEnabled:
      patch.ratesEnabled !== undefined ? Boolean(patch.ratesEnabled) : cur.ratesEnabled,
    modePegged1to1Enabled:
      patch.modePegged1to1Enabled !== undefined
        ? Boolean(patch.modePegged1to1Enabled)
        : cur.modePegged1to1Enabled,
    modeMarketEnabled:
      patch.modeMarketEnabled !== undefined
        ? Boolean(patch.modeMarketEnabled)
        : cur.modeMarketEnabled,
    depegThresholdBps:
      patch.depegThresholdBps !== undefined
        ? Number(patch.depegThresholdBps)
        : cur.depegThresholdBps,
    allowedQuoteLockSeconds:
      patch.allowedQuoteLockSeconds !== undefined
        ? patch.allowedQuoteLockSeconds.map(Number)
        : cur.allowedQuoteLockSeconds,
    minRateSources:
      patch.minRateSources !== undefined
        ? Number(patch.minRateSources)
        : cur.minRateSources,
    rateVenues:
      patch.rateVenues !== undefined
        ? patch.rateVenues.map(String)
        : cur.rateVenues,
    chainlinkReferenceEnabled:
      patch.chainlinkReferenceEnabled !== undefined
        ? Boolean(patch.chainlinkReferenceEnabled)
        : cur.chainlinkReferenceEnabled,
    referenceDeviationBps:
      patch.referenceDeviationBps !== undefined
        ? Number(patch.referenceDeviationBps)
        : cur.referenceDeviationBps,
  };
  if (!Number.isFinite(next.depegThresholdBps) || next.depegThresholdBps < 0) {
    throw Object.assign(new Error("invalid_depeg_threshold"), { code: "invalid_request" });
  }
  if (
    !Number.isFinite(next.minRateSources) ||
    next.minRateSources < 1 ||
    next.minRateSources > 5
  ) {
    throw Object.assign(new Error("invalid_min_rate_sources"), {
      code: "invalid_request",
    });
  }
  if (
    !Number.isFinite(next.referenceDeviationBps) ||
    next.referenceDeviationBps < 0
  ) {
    throw Object.assign(new Error("invalid_reference_deviation"), {
      code: "invalid_request",
    });
  }
  const venueSet = new Set(RATE_VENUES);
  for (const v of next.rateVenues) {
    if (!venueSet.has(v)) {
      throw Object.assign(new Error("invalid_rate_venue"), { code: "invalid_request" });
    }
  }
  if (next.rateVenues.length === 0) {
    throw Object.assign(new Error("rate_venues_empty"), { code: "invalid_request" });
  }
  if (next.minRateSources > next.rateVenues.length) {
    throw Object.assign(new Error("min_sources_gt_venues"), {
      code: "invalid_request",
    });
  }
  const allowed = new Set(ALLOWED_QUOTE_LOCK_SECONDS);
  for (const s of next.allowedQuoteLockSeconds) {
    if (!allowed.has(s)) {
      throw Object.assign(new Error("invalid_quote_lock"), { code: "invalid_request" });
    }
  }
  if (next.allowedQuoteLockSeconds.length === 0) {
    throw Object.assign(new Error("allowed_quote_lock_empty"), { code: "invalid_request" });
  }

  const pool = getPool();
  await pool.query(
    `INSERT INTO platform_pricing_settings (
       id, rates_enabled, mode_pegged_1to1_enabled, mode_market_enabled,
       depeg_threshold_bps, allowed_quote_lock_seconds, updated_at,
       min_rate_sources, rate_venues, chainlink_reference_enabled,
       reference_deviation_bps
     ) VALUES (1, $1, $2, $3, $4, $5, now(), $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       rates_enabled = EXCLUDED.rates_enabled,
       mode_pegged_1to1_enabled = EXCLUDED.mode_pegged_1to1_enabled,
       mode_market_enabled = EXCLUDED.mode_market_enabled,
       depeg_threshold_bps = EXCLUDED.depeg_threshold_bps,
       allowed_quote_lock_seconds = EXCLUDED.allowed_quote_lock_seconds,
       min_rate_sources = EXCLUDED.min_rate_sources,
       rate_venues = EXCLUDED.rate_venues,
       chainlink_reference_enabled = EXCLUDED.chainlink_reference_enabled,
       reference_deviation_bps = EXCLUDED.reference_deviation_bps,
       updated_at = now()`,
    [
      next.ratesEnabled,
      next.modePegged1to1Enabled,
      next.modeMarketEnabled,
      next.depegThresholdBps,
      next.allowedQuoteLockSeconds,
      next.minRateSources,
      next.rateVenues,
      next.chainlinkReferenceEnabled,
      next.referenceDeviationBps,
    ],
  );

  // Expire in-flight quotes for modes (or the whole rate feed) just disabled.
  /** @type {string[]} */
  const expireModes = [];
  if (cur.modePegged1to1Enabled && !next.modePegged1to1Enabled) {
    expireModes.push("pegged_1to1");
  }
  if (cur.modeMarketEnabled && !next.modeMarketEnabled) {
    expireModes.push("market", "depeg_market");
  }
  if ((cur.ratesEnabled && !next.ratesEnabled) || expireModes.length > 0) {
    if (!next.ratesEnabled) {
      await pool.query(
        `UPDATE payment_orders
            SET quote_expires_at = now(), updated_at = now()
          WHERE status = 'pending_payment'
            AND quote_expires_at IS NOT NULL
            AND quote_expires_at > now()`,
      );
    } else if (expireModes.length > 0) {
      await pool.query(
        `UPDATE payment_orders
            SET quote_expires_at = now(), updated_at = now()
          WHERE status = 'pending_payment'
            AND pricing_mode = ANY($1::text[])
            AND quote_expires_at IS NOT NULL
            AND quote_expires_at > now()`,
        [expireModes],
      );
    }
  }

  return getPlatformPricingSettings();
}

/**
 * @param {string} orgId
 */
export async function getMerchantPricingSettings(orgId) {
  const pool = getPool();
  const platform = await getPlatformPricingSettings();
  try {
    const { rows } = await pool.query(
      `SELECT pricing_mode, quote_lock_seconds, updated_at
         FROM merchant_pricing_settings
        WHERE org_id = $1`,
      [orgId],
    );
    const row = rows[0];
    if (!row) {
      return {
        pricingMode: PricingMode.Pegged1to1,
        quoteLockSeconds: DEFAULT_QUOTE_LOCK_SECONDS,
        effective: resolveEffectiveMerchantPricing(
          { pricingMode: PricingMode.Pegged1to1, quoteLockSeconds: DEFAULT_QUOTE_LOCK_SECONDS },
          platform,
        ),
      };
    }
    const stored = {
      pricingMode: row.pricing_mode,
      quoteLockSeconds: Number(row.quote_lock_seconds),
      updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
    };
    return {
      ...stored,
      effective: resolveEffectiveMerchantPricing(stored, platform),
    };
  } catch (err) {
    if (/merchant_pricing_settings|does not exist/i.test(err?.message ?? "")) {
      return {
        pricingMode: PricingMode.Pegged1to1,
        quoteLockSeconds: DEFAULT_QUOTE_LOCK_SECONDS,
        effective: resolveEffectiveMerchantPricing(
          { pricingMode: PricingMode.Pegged1to1, quoteLockSeconds: DEFAULT_QUOTE_LOCK_SECONDS },
          platform,
        ),
      };
    }
    throw err;
  }
}

/**
 * @param {{ pricingMode: string, quoteLockSeconds: number }} stored
 * @param {Awaited<ReturnType<typeof getPlatformPricingSettings>>} platform
 */
export function resolveEffectiveMerchantPricing(stored, platform) {
  const modeEnabled =
    stored.pricingMode === PricingMode.Market
      ? platform.modeMarketEnabled
      : platform.modePegged1to1Enabled;
  const lockAllowed = platform.allowedQuoteLockSeconds.includes(
    stored.quoteLockSeconds,
  );
  return {
    ratesEnabled: platform.ratesEnabled,
    modeAvailable: Boolean(modeEnabled),
    pricingMode: stored.pricingMode,
    quoteLockSeconds: lockAllowed
      ? stored.quoteLockSeconds
      : platform.allowedQuoteLockSeconds.includes(DEFAULT_QUOTE_LOCK_SECONDS)
        ? DEFAULT_QUOTE_LOCK_SECONDS
        : platform.allowedQuoteLockSeconds[0],
    depegThresholdBps: platform.depegThresholdBps,
    minRateSources: platform.minRateSources,
    rateVenues: platform.rateVenues,
    chainlinkReferenceEnabled: platform.chainlinkReferenceEnabled,
    referenceDeviationBps: platform.referenceDeviationBps,
  };
}

/**
 * @param {string} orgId
 * @param {{ pricingMode?: string, quoteLockSeconds?: number }} patch
 */
export async function updateMerchantPricingSettings(orgId, patch) {
  const platform = await getPlatformPricingSettings();
  const cur = await getMerchantPricingSettings(orgId);
  const pricingMode = patch.pricingMode ?? cur.pricingMode;
  const quoteLockSeconds = patch.quoteLockSeconds ?? cur.quoteLockSeconds;

  if (pricingMode !== PricingMode.Pegged1to1 && pricingMode !== PricingMode.Market) {
    throw Object.assign(new Error("invalid_pricing_mode"), { code: "invalid_request" });
  }
  if (pricingMode === PricingMode.Pegged1to1 && !platform.modePegged1to1Enabled) {
    throw Object.assign(new Error("pricing_mode_disabled"), { code: "pricing_mode_unavailable" });
  }
  if (pricingMode === PricingMode.Market && !platform.modeMarketEnabled) {
    throw Object.assign(new Error("pricing_mode_disabled"), { code: "pricing_mode_unavailable" });
  }
  if (!platform.allowedQuoteLockSeconds.includes(Number(quoteLockSeconds))) {
    throw Object.assign(new Error("quote_lock_not_allowed"), { code: "invalid_request" });
  }

  const pool = getPool();
  await pool.query(
    `INSERT INTO merchant_pricing_settings (org_id, pricing_mode, quote_lock_seconds, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (org_id) DO UPDATE SET
       pricing_mode = EXCLUDED.pricing_mode,
       quote_lock_seconds = EXCLUDED.quote_lock_seconds,
       updated_at = now()`,
    [orgId, pricingMode, quoteLockSeconds],
  );
  return getMerchantPricingSettings(orgId);
}
