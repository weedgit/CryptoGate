/**
 * Platform rate feed diagnostics: live per-venue probe and a dry-run quote.
 * Neither touches orders.
 */
import { resolveEffectiveAssetNetworkConfig } from "../platform-settings/network-rail-resolve.mjs";
import { fetchChainlinkUsd, FEEDS } from "./chainlink-reference.mjs";
import { EUR_USD_VENUES, probeEurUsdSources } from "./eur-usd.mjs";
import { coinGeckoMinIntervalMs } from "./coingecko-batch.mjs";
import { RATE_REFRESH_INTERVAL_MS, getRateFeedHealth } from "./rate-refresh-job.mjs";
import { breakerState } from "./venue-guard.mjs";
import { deviationBps, medianRate } from "./median.mjs";
import { getPlatformPricingSettings } from "./pricing-settings-store.mjs";
import { resolveOrderQuote } from "./resolve-order-quote.mjs";
import {
  PEG_LAST_KNOWN_MAX_AGE_MS,
  RATE_ASSETS,
  RATE_VENUES,
  STALE_MAX_AGE_MS,
  fetchVenueUsdPrice,
  getLastGoodUsdPrice,
  venueGuardKey,
  venueSupportsAsset,
} from "./usd-price.mjs";

const STATUS_CACHE_MS = 15_000;
const MIN_REFRESH_MS = 5_000;

/** @type {{ result: object, at: number } | null} */
let statusCache = null;

function errorText(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ value: T | null, error: string | null, latencyMs: number }>}
 */
async function timed(fn) {
  const t0 = performance.now();
  try {
    const value = await fn();
    return { value, error: null, latencyMs: Math.round(performance.now() - t0) };
  } catch (err) {
    return { value: null, error: errorText(err), latencyMs: Math.round(performance.now() - t0) };
  }
}

/**
 * @param {Array<{ rate: string | null, enabled: boolean }>} rows
 */
function medianOfEnabled(rows) {
  const rates = rows.filter((r) => r.enabled && r.rate).map((r) => /** @type {string} */ (r.rate));
  return rates.length ? medianRate(rates) : null;
}

/**
 * @param {string} asset
 * @param {Awaited<ReturnType<typeof getPlatformPricingSettings>>} platform
 * @param {typeof fetch} fetchImpl
 */
async function probeAsset(asset, platform, fetchImpl) {
  const venues = await Promise.all(
    RATE_VENUES.map(async (venue) => {
      const enabled = platform.rateVenues.includes(venue);
      if (!venueSupportsAsset(venue, asset)) {
        return { venue, enabled, supported: false, rate: null, error: null, latencyMs: null, pausedUntil: null };
      }
      const r = await timed(() => fetchVenueUsdPrice(venue, asset, fetchImpl));
      return {
        venue,
        enabled,
        supported: true,
        rate: r.value?.rate || null,
        error: r.error ?? (r.value?.rate ? null : "no_rate"),
        latencyMs: r.latencyMs,
        pausedUntil: breakerState(venueGuardKey(venue, asset)).pausedUntil,
      };
    }),
  );

  const median = medianOfEnabled(venues);
  const healthyCount = venues.filter((v) => v.enabled && v.rate).length;
  const rows = venues.map((v) => ({
    ...v,
    deviationBps: median && v.rate ? deviationBps(v.rate, median) : null,
  }));

  let chainlink = null;
  if (FEEDS[asset]) {
    const r = await timed(() => fetchChainlinkUsd(asset, fetchImpl));
    const rate = r.value?.rate ?? null;
    const bps = median && rate ? deviationBps(median, rate) : null;
    chainlink = {
      rate,
      error: r.error,
      latencyMs: r.latencyMs,
      deviationBps: bps,
      withinBand: bps === null ? null : bps <= platform.referenceDeviationBps,
    };
  }

  const last = getLastGoodUsdPrice(asset);
  return {
    asset,
    median,
    lastGoodAgeSeconds: last ? Math.round(last.ageMs / 1000) : null,
    healthyCount,
    requiredSources: platform.minRateSources,
    quotable: healthyCount >= platform.minRateSources,
    venues: rows,
    chainlink,
  };
}

/**
 * @param {Awaited<ReturnType<typeof getPlatformPricingSettings>>} platform
 * @param {typeof fetch} fetchImpl
 */
async function probeEurUsd(platform, fetchImpl) {
  const t0 = performance.now();
  let probe;
  try {
    probe = await probeEurUsdSources(fetchImpl);
  } catch (err) {
    probe = { sources: [], errors: RATE_VENUES.map((source) => ({ source, error: errorText(err) })) };
  }
  const latencyMs = Math.round(performance.now() - t0);
  const median = probe.sources.length ? medianRate(probe.sources.map((s) => s.rate)) : null;
  const requiredSources = Math.min(2, platform.minRateSources);
  const byVenue = new Map(probe.sources.map((s) => [s.source, s.rate]));
  const errByVenue = new Map(probe.errors.map((e) => [e.source, e.error]));
  return {
    median,
    healthyCount: probe.sources.length,
    requiredSources,
    quotable: probe.sources.length >= requiredSources,
    latencyMs,
    venues: RATE_VENUES.map((venue) => {
      const supported = EUR_USD_VENUES.includes(venue);
      const rate = byVenue.get(venue) ?? null;
      return {
        venue,
        supported,
        rate,
        error: rate || !supported ? null : errByVenue.get(venue) ?? "no_rate",
        deviationBps: median && rate ? deviationBps(rate, median) : null,
      };
    }),
  };
}

/**
 * Probe every venue for every asset, plus Chainlink and EUR/USD.
 * Shared 15s cache; `refresh` bypasses it but not more than once per 5s.
 * @param {{ refresh?: boolean, fetchImpl?: typeof fetch, now?: number }} [opts]
 */
export async function getRateFeedStatus(opts = {}) {
  const now = opts.now ?? Date.now();
  if (statusCache) {
    const age = now - statusCache.at;
    if (age < MIN_REFRESH_MS || (!opts.refresh && age < STATUS_CACHE_MS)) {
      return { ...statusCache.result, cached: true };
    }
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const platform = await getPlatformPricingSettings();
  const [assets, eurUsd] = await Promise.all([
    Promise.all(RATE_ASSETS.map((a) => probeAsset(a, platform, fetchImpl))),
    probeEurUsd(platform, fetchImpl),
  ]);
  const result = {
    checkedAt: new Date(now).toISOString(),
    settings: {
      ratesEnabled: platform.ratesEnabled,
      minRateSources: platform.minRateSources,
      rateVenues: platform.rateVenues,
      chainlinkReferenceEnabled: platform.chainlinkReferenceEnabled,
      referenceDeviationBps: platform.referenceDeviationBps,
      staleMaxSeconds: STALE_MAX_AGE_MS / 1000,
      pegLastKnownMaxSeconds: PEG_LAST_KNOWN_MAX_AGE_MS / 1000,
      refreshIntervalSeconds: RATE_REFRESH_INTERVAL_MS / 1000,
      coinGeckoIntervalSeconds: Math.round(coinGeckoMinIntervalMs() / 1000),
    },
    monitor: getRateFeedHealth(),
    assets,
    eurUsd,
  };
  statusCache = { result, at: now };
  return { ...result, cached: false };
}

export function clearRateFeedStatusCache() {
  statusCache = null;
}

const TEST_PRICING_MODES = new Set(["market", "pegged_1to1"]);

/**
 * Price an invoice exactly as create-order would under the given merchant mode,
 * using platform-level rail config. Never creates an order.
 * @param {Record<string, unknown>} body
 */
export async function runTestQuote(body) {
  const asset = String(body?.asset ?? "").trim().toUpperCase();
  const network = String(body?.network ?? "").trim().toLowerCase();
  const amount = String(body?.amount ?? "").trim();
  const currency = String(body?.currency ?? "USD").trim().toUpperCase();
  const pricingMode = String(body?.pricingMode ?? "market").trim();

  if (!asset || !network) {
    return { ok: false, status: 400, code: "invalid_request", message: "asset and network are required" };
  }
  if (!["USD", "EUR", "CRYPTO"].includes(currency)) {
    return { ok: false, status: 400, code: "invalid_request", message: "currency must be USD, EUR or CRYPTO" };
  }
  if (!TEST_PRICING_MODES.has(pricingMode)) {
    return { ok: false, status: 400, code: "invalid_request", message: "pricingMode must be market or pegged_1to1" };
  }

  const config = await resolveEffectiveAssetNetworkConfig(asset, network, {});
  if (!config) {
    return { ok: false, status: 422, code: "asset_network_disabled", message: "Asset and network are not enabled" };
  }

  const platform = await getPlatformPricingSettings();
  const lockRaw = Number(body?.quoteLockSeconds);
  const quoteLockSeconds = Number.isInteger(lockRaw) ? lockRaw : 900;
  const crypto = currency === "CRYPTO";
  const quoted = await resolveOrderQuote({
    pricing: { pricingMode, quoteLockSeconds },
    invoiceAmount: amount,
    invoiceCurrency: crypto ? "USD" : currency,
    invoiceDenomination: crypto ? "crypto" : "fiat",
    amountCrypto: crypto ? amount : undefined,
    asset,
    network,
    decimals: config.decimals,
    minAmount: config.minAmount,
  });
  if (!quoted.ok) return quoted;
  return {
    ok: true,
    result: {
      asset,
      network,
      decimals: config.decimals,
      minAmount: config.minAmount,
      pricingMode,
      minRateSources: platform.minRateSources,
      quote: quoted.quote,
    },
  };
}
