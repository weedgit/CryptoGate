import { FeeTierEffectiveTiming, MerchantTier } from "@paymentgate/domain";

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
 * @param {string | null | undefined} raw
 */
function parseUsd(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
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
  const agentPct = parsePercent(band.agentCommissionPercent ?? "15");
  const volumeMin = parseUsd(band.volumeMinUsd ?? "0");
  const volumeMaxRaw = band.volumeMaxUsd;
  const volumeMax =
    volumeMaxRaw === null || volumeMaxRaw === undefined || volumeMaxRaw === ""
      ? null
      : parseUsd(volumeMaxRaw);
  if (
    !subscriptionAmountUsd ||
    min === null ||
    max === null ||
    def === null ||
    agentPct === null ||
    volumeMin === null
  ) {
    return fail(400, "invalid_request", "Tier band fields must be numeric strings");
  }
  if (volumeMaxRaw !== null && volumeMaxRaw !== undefined && volumeMaxRaw !== "" && volumeMax === null) {
    return fail(400, "invalid_request", "volumeMaxUsd must be a non-negative number");
  }
  if (volumeMax !== null && volumeMin > volumeMax) {
    return fail(422, "invalid_band", "volumeMinUsd ≤ volumeMaxUsd required");
  }
  if (min > max || def < min || def > max) {
    return fail(
      422,
      "invalid_band",
      "volumeFeeMinPercent ≤ defaultSignupPercent ≤ volumeFeeMaxPercent required",
    );
  }
  if (agentPct < 0 || agentPct > 100) {
    return fail(422, "invalid_band", "agentCommissionPercent must be 0–100");
  }
  const tierDescription =
    typeof band.tierDescription === "string" ? band.tierDescription : undefined;
  return {
    ok: true,
    band: {
      tier,
      subscriptionAmountUsd,
      volumeFeeMinPercent: String(band.volumeFeeMinPercent).trim(),
      volumeFeeMaxPercent: String(band.volumeFeeMaxPercent).trim(),
      defaultSignupPercent: String(band.defaultSignupPercent).trim(),
      volumeMinUsd: String(band.volumeMinUsd ?? "0").trim(),
      volumeMaxUsd:
        volumeMax === null ? null : String(band.volumeMaxUsd).trim(),
      agentCommissionPercent: String(band.agentCommissionPercent ?? "15").trim(),
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
  const timingRaw =
    typeof body.effectiveTiming === "string" ? body.effectiveTiming.trim() : "";
  const effectiveTiming =
    timingRaw === FeeTierEffectiveTiming.NextBillingCycle ||
    timingRaw === "next_billing_cycle"
      ? FeeTierEffectiveTiming.NextBillingCycle
      : FeeTierEffectiveTiming.Immediate;
  return { ok: true, tiers: bands, effectiveTiming };
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
 * Pick tier for a USD volume against live schedule bands.
 * @param {number} volumeUsd
 * @param {object[]} bandRows — DB rows or toFeeTierBand objects
 */
export function resolveTierForVolume(volumeUsd, bandRows) {
  const vol = Number.isFinite(volumeUsd) ? volumeUsd : 0;
  const normalized = bandRows.map((row) => ({
    tier: row.tier,
    min: Number(row.volume_min_usd ?? row.volumeMinUsd ?? 0),
    max:
      row.volume_max_usd === null ||
      row.volume_max_usd === undefined ||
      row.volumeMaxUsd === null ||
      row.volumeMaxUsd === undefined ||
      row.volume_max_usd === "" ||
      row.volumeMaxUsd === ""
        ? null
        : Number(row.volume_max_usd ?? row.volumeMaxUsd),
  }));
  // Prefer highest matching floor (enterprise over mid over small).
  const order = { enterprise: 3, mid: 2, small: 1 };
  const matches = normalized
    .filter((b) => {
      if (!Number.isFinite(b.min)) return false;
      if (vol < b.min) return false;
      if (b.max !== null && Number.isFinite(b.max) && vol >= b.max) return false;
      return true;
    })
    .sort((a, b) => (order[b.tier] ?? 0) - (order[a.tier] ?? 0));
  return matches[0]?.tier ?? MerchantTier.Small;
}

/**
 * @param {number} status
 * @param {string} code
 * @param {string} message
 */
function fail(status, code, message) {
  return { ok: false, status, code, message };
}
