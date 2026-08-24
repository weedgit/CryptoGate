import { MerchantTier } from "@cryptogate/domain";

const TIERS = [MerchantTier.Small, MerchantTier.Mid, MerchantTier.Enterprise];

/**
 * @param {string} raw
 */
function parsePercent(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * @param {object} band
 */
export function validateFeeTierBand(band) {
  if (!band || typeof band !== "object") {
    return fail(400, "invalid_request", "Invalid tier band");
  }
  const tier = typeof band.tier === "string" ? band.tier : "";
  if (!TIERS.includes(tier)) {
    return fail(400, "invalid_request", "Invalid tier");
  }
  const subscriptionAmountUsd =
    typeof band.subscriptionAmountUsd === "string"
      ? band.subscriptionAmountUsd.trim()
      : "";
  const min = parsePercent(band.volumeFeeMinPercent);
  const max = parsePercent(band.volumeFeeMaxPercent);
  const def = parsePercent(band.defaultSignupPercent);
  if (!subscriptionAmountUsd || min === null || max === null || def === null) {
    return fail(400, "invalid_request", "Tier band fields must be numeric strings");
  }
  if (min > max || def < min || def > max) {
    return fail(
      422,
      "invalid_band",
      "volumeFeeMinPercent ≤ defaultSignupPercent ≤ volumeFeeMaxPercent required",
    );
  }
  const tierDescription =
    typeof band.tierDescription === "string" ? band.tierDescription : undefined;
  return {
    ok: true,
    band: {
      tier,
      subscriptionAmountUsd,
      volumeFeeMinPercent: band.volumeFeeMinPercent,
      volumeFeeMaxPercent: band.volumeFeeMaxPercent,
      defaultSignupPercent: band.defaultSignupPercent,
      tierDescription,
    },
  };
}

/**
 * @param {unknown} body
 */
export function validateUpdateFeeTierSettingsBody(body) {
  if (!body || typeof body !== "object" || !Array.isArray(body.tiers)) {
    return fail(400, "invalid_request", "tiers array is required");
  }
  if (body.tiers.length !== 3) {
    return fail(400, "invalid_request", "Exactly three tier bands required");
  }
  /** @type {object[]} */
  const bands = [];
  const seen = new Set();
  for (const row of body.tiers) {
    const v = validateFeeTierBand(row);
    if (!v.ok) return v;
    if (seen.has(v.band.tier)) {
      return fail(400, "invalid_request", "Duplicate tier in request");
    }
    seen.add(v.band.tier);
    bands.push(v.band);
  }
  for (const t of TIERS) {
    if (!seen.has(t)) {
      return fail(400, "invalid_request", `Missing tier: ${t}`);
    }
  }
  return { ok: true, tiers: bands };
}

/**
 * @param {string} percent
 * @param {{ volume_fee_min_percent: string, volume_fee_max_percent: string }} band
 */
export function isPercentWithinBand(percent, band) {
  const p = parsePercent(percent);
  const min = parsePercent(band.volume_fee_min_percent);
  const max = parsePercent(band.volume_fee_max_percent);
  if (p === null || min === null || max === null) return false;
  return p >= min && p <= max;
}

/**
 * First day of next calendar month (UTC) — billing period boundary.
 */
export function nextBillingPeriodStart() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const next = new Date(Date.UTC(m === 11 ? y + 1 : y, (m + 1) % 12, 1));
  return next.toISOString().slice(0, 10);
}

/**
 * @param {number} status
 * @param {string} code
 * @param {string} message
 */
function fail(status, code, message) {
  return { ok: false, status, code, message };
}
