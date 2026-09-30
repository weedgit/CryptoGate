/**
 * USD price feed: parallel multi-venue median + optional Chainlink reference.
 * Cache TTL 45s (kept warm by the rate refresh job). Fails closed when healthy
 * sources < minSources, except that the last good median may be reused for up
 * to STALE_MAX_AGE_MS (marked stale) to ride out short outages.
 */

import { isStablecoinAsset } from "@paymentgate/domain";
import { deviationBps, medianRate, normalizeRate } from "./median.mjs";
import { fetchChainlinkUsd } from "./chainlink-reference.mjs";
import { clearCoinGeckoBatch, getCoinGeckoBatch } from "./coingecko-batch.mjs";
import { isWithinPeg } from "./pricing.mjs";
import { VENUE_TIMEOUT_MS, guardVenue, resetVenueGuards } from "./venue-guard.mjs";

const CACHE_TTL_MS = 45_000;
export const STALE_MAX_AGE_MS = 10 * 60_000;
export const PEG_LAST_KNOWN_MAX_AGE_MS = 60 * 60_000;

export const RATE_VENUES = ["binance", "coingecko", "kraken", "coinbase", "bitstamp"];

/** @typedef {'binance' | 'coingecko' | 'kraken' | 'coinbase' | 'bitstamp'} RateVenue */
/** @typedef {{ source: RateVenue, rate: string }} VenueRate */
/**
 * @typedef {{
 *   rate: string,
 *   source: string,
 *   fetchedAt: string,
 *   sources: VenueRate[],
 *   referenceRate?: string | null,
 *   referenceSource?: string | null,
 *   rateWarning?: string | null,
 *   stale?: boolean,
 * }} UsdPriceQuote
 */

/** @type {Map<string, { quote: UsdPriceQuote, expiresAt: number }>} */
const cache = new Map();
/** @type {Map<string, { quote: UsdPriceQuote, at: number }>} */
const lastGood = new Map();

/**
 * Binance quotes in USDT. It has no USDT/USD market, so USDT is priced only by
 * venues with a real USD quote (a constant would fake a healthy source).
 */
const BINANCE_SYMBOL = {
  ETH: "ETHUSDT",
  TRX: "TRXUSDT",
  USDC: "USDCUSDT",
};

const COINGECKO_ID = {
  ETH: "ethereum",
  TRX: "tron",
  USDT: "tether",
  USDC: "usd-coin",
};

/** Kraken pair ids in ticker response. */
const KRAKEN_PAIR = {
  ETH: "XETHZUSD",
  TRX: "TRXUSD",
  USDT: "USDTZUSD",
  USDC: "USDCUSD",
};

/** Coinbase has no TRX market, and treats USDC as USD (no USDC-USD order book). */
const COINBASE_PRODUCT = {
  ETH: "ETH-USD",
  USDT: "USDT-USD",
};

const BITSTAMP_PAIR = {
  ETH: "ethusd",
  TRX: "trxusd",
  USDT: "usdtusd",
  USDC: "usdcusd",
};

const DEFAULT_VENUES = [...RATE_VENUES];
const DEFAULT_MIN_SOURCES = 2;
export const DEFAULT_REFERENCE_DEVIATION_BPS = 150;

function nowIso() {
  return new Date().toISOString();
}

/** @param {typeof fetch} fetchImpl @param {string} url */
async function getJson(fetchImpl, url, prefix) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(VENUE_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${prefix}_http_${res.status}`);
  return res.json();
}

/**
 * @param {string} asset
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<VenueRate>}
 */
async function fetchBinance(asset, fetchImpl) {
  const symbol = BINANCE_SYMBOL[asset];
  if (!symbol) throw new Error(`binance_unsupported:${asset}`);
  const body = await getJson(
    fetchImpl,
    `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
    "binance",
  );
  return { source: "binance", rate: normalizeRate(body.price) };
}

/**
 * @param {string} asset
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<VenueRate>}
 */
async function fetchCoinGecko(asset, fetchImpl) {
  const id = COINGECKO_ID[asset];
  if (!id) throw new Error(`coingecko_unsupported:${asset}`);
  const { body } = await getCoinGeckoBatch(fetchImpl);
  return { source: "coingecko", rate: normalizeRate(body?.[id]?.usd) };
}

/**
 * @param {string} asset
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<VenueRate>}
 */
async function fetchKraken(asset, fetchImpl) {
  const pair = KRAKEN_PAIR[asset];
  if (!pair) throw new Error(`kraken_unsupported:${asset}`);
  const body = await getJson(
    fetchImpl,
    `https://api.kraken.com/0/public/Ticker?pair=${pair}`,
    "kraken",
  );
  if (body?.error?.length) throw new Error(`kraken_error:${body.error[0]}`);
  const result = body?.result ?? {};
  const entry = result[pair] ?? Object.values(result)[0];
  const last = entry?.c?.[0];
  return { source: "kraken", rate: normalizeRate(last) };
}

/**
 * @param {string} asset
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<VenueRate>}
 */
async function fetchCoinbase(asset, fetchImpl) {
  const product = COINBASE_PRODUCT[asset];
  if (!product) throw new Error(`coinbase_unsupported:${asset}`);
  const body = await getJson(
    fetchImpl,
    `https://api.exchange.coinbase.com/products/${product}/ticker`,
    "coinbase",
  );
  return { source: "coinbase", rate: normalizeRate(body?.price) };
}

/**
 * @param {string} asset
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<VenueRate>}
 */
async function fetchBitstamp(asset, fetchImpl) {
  const pair = BITSTAMP_PAIR[asset];
  if (!pair) throw new Error(`bitstamp_unsupported:${asset}`);
  const body = await getJson(
    fetchImpl,
    `https://www.bitstamp.net/api/v2/ticker/${pair}/`,
    "bitstamp",
  );
  return { source: "bitstamp", rate: normalizeRate(body?.last) };
}

const VENUE_SYMBOLS = {
  binance: BINANCE_SYMBOL,
  coingecko: COINGECKO_ID,
  kraken: KRAKEN_PAIR,
  coinbase: COINBASE_PRODUCT,
  bitstamp: BITSTAMP_PAIR,
};

/**
 * Fewest selected venues that can price any single supported asset
 * (a higher minimum would fail every quote for that asset).
 * @param {string[]} venues
 */
export function minVenueCoverage(venues) {
  const selected = venues.map((v) => String(v).toLowerCase()).filter((v) => v in VENUE_SYMBOLS);
  let min = Infinity;
  for (const asset of Object.keys(COINGECKO_ID)) {
    const n = selected.filter((v) => asset in VENUE_SYMBOLS[v]).length;
    if (n < min) min = n;
  }
  return Number.isFinite(min) ? min : 0;
}

const FETCHERS = {
  binance: fetchBinance,
  coingecko: fetchCoinGecko,
  kraken: fetchKraken,
  coinbase: fetchCoinbase,
  bitstamp: fetchBitstamp,
};

/** Assets the feed can price. */
export const RATE_ASSETS = Object.keys(COINGECKO_ID);

/**
 * @param {string} venue
 * @param {string} asset
 */
export function venueSupportsAsset(venue, asset) {
  const symbols = VENUE_SYMBOLS[String(venue).toLowerCase()];
  return Boolean(symbols && asset in symbols);
}

/** Circuit-breaker key for one venue + asset (CoinGecko is one batched call). */
export function venueGuardKey(venue, asset) {
  return venue === "coingecko" ? "coingecko" : `${venue}:${asset}`;
}

/**
 * One venue, one asset, no cache and no breaker (status probe).
 * @param {string} venue
 * @param {string} asset
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<VenueRate>}
 */
export function fetchVenueUsdPrice(venue, asset, fetchImpl = fetch) {
  const fetcher = FETCHERS[String(venue).toLowerCase()];
  if (!fetcher) return Promise.reject(new Error(`unknown_venue:${venue}`));
  return fetcher(String(asset).toUpperCase(), fetchImpl);
}

/**
 * @param {string} venue
 * @param {string} asset
 * @param {typeof fetch} fetchImpl
 */
function fetchGuarded(venue, asset, fetchImpl) {
  if (venue === "coingecko") return fetchCoinGecko(asset, fetchImpl);
  return guardVenue(venueGuardKey(venue, asset), () => FETCHERS[venue](asset, fetchImpl));
}

/**
 * Last successful median for an asset, whatever its age.
 * @param {string} asset
 * @returns {{ quote: UsdPriceQuote, ageMs: number } | null}
 */
export function getLastGoodUsdPrice(asset, now = Date.now()) {
  const hit = lastGood.get(String(asset ?? "").trim().toUpperCase());
  return hit ? { quote: hit.quote, ageMs: now - hit.at } : null;
}

/**
 * @param {string} code
 * @param {Error & { code?: string }} err
 * @returns {UsdPriceQuote}
 */
function staleOrThrow(code, err) {
  const hit = getLastGoodUsdPrice(code);
  if (!hit || hit.ageMs > STALE_MAX_AGE_MS) throw err;
  const ageSeconds = Math.round(hit.ageMs / 1000);
  return {
    ...hit.quote,
    stale: true,
    rateWarning: `stale_rate:${ageSeconds}s`,
  };
}

/**
 * @param {string} asset
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   bypassCache?: boolean,
 *   minSources?: number,
 *   venues?: string[],
 *   chainlinkReferenceEnabled?: boolean,
 *   referenceDeviationBps?: number,
 * }} [opts]
 * @returns {Promise<UsdPriceQuote>}
 */
export async function getUsdPrice(asset, opts = {}) {
  const code = String(asset ?? "").trim().toUpperCase();
  if (!code) {
    throw Object.assign(new Error("asset_required"), { code: "invalid_request" });
  }

  const cached = cache.get(code);
  if (!opts.bypassCache && cached && cached.expiresAt > Date.now()) {
    return cached.quote;
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const venues = (opts.venues?.length ? opts.venues : DEFAULT_VENUES)
    .map((v) => String(v).toLowerCase())
    .filter((v) => v in FETCHERS && venueSupportsAsset(v, code));
  const minSources = Number.isFinite(opts.minSources)
    ? Math.max(1, Number(opts.minSources))
    : DEFAULT_MIN_SOURCES;

  const settled = await Promise.allSettled(
    venues.map((v) => fetchGuarded(v, code, fetchImpl)),
  );
  /** @type {VenueRate[]} */
  const healthy = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value?.rate) {
      healthy.push(r.value);
    }
  }

  if (healthy.length < minSources) {
    const e = new Error("rates_unavailable");
    e.code = "rates_unavailable";
    e.message = `Need at least ${minSources} healthy rate sources (got ${healthy.length})`;
    return staleOrThrow(code, e);
  }

  const rate = medianRate(healthy.map((h) => h.rate));
  const sourceLabel = `median:${healthy.map((h) => h.source).join(",")}`;

  /** @type {UsdPriceQuote} */
  const quote = {
    rate,
    source: sourceLabel,
    fetchedAt: nowIso(),
    sources: healthy,
    referenceRate: null,
    referenceSource: null,
    rateWarning: null,
  };

  if (opts.chainlinkReferenceEnabled) {
    try {
      const ref = await fetchChainlinkUsd(code, fetchImpl);
      if (ref) {
        quote.referenceRate = ref.rate;
        quote.referenceSource = "chainlink";
        const band =
          Number.isFinite(opts.referenceDeviationBps)
            ? Number(opts.referenceDeviationBps)
            : DEFAULT_REFERENCE_DEVIATION_BPS;
        const bps = deviationBps(rate, ref.rate);
        if (bps > band) {
          if (isStablecoinAsset(code)) {
            quote.rateWarning = `median_vs_chainlink_${bps}bps`;
          } else {
            const e = new Error("rate_reference_rejected");
            e.code = "rate_reference_rejected";
            e.message = `Median rate diverges from Chainlink by ${bps} bps (max ${band})`;
            throw e;
          }
        }
      }
    } catch (err) {
      if (err?.code === "rate_reference_rejected") throw err;
      // Missing feed / RPC failure: do not block quotes when reference is unavailable.
      quote.rateWarning = quote.rateWarning ?? "chainlink_unavailable";
    }
  }

  cache.set(code, { quote, expiresAt: Date.now() + CACHE_TTL_MS });
  lastGood.set(code, { quote, at: Date.now() });
  return quote;
}

/**
 * Stablecoin price for pegged 1:1 merchants when the live median (and the
 * stale window) is unavailable: a last known median still inside the peg band,
 * else Chainlink confirming the peg. Null when neither confirms the peg.
 * @param {string} asset
 * @param {{ depegThresholdBps: number, fetchImpl?: typeof fetch, now?: number }} opts
 * @returns {Promise<UsdPriceQuote | null>}
 */
export async function getPegFallbackPrice(asset, opts) {
  const code = String(asset ?? "").trim().toUpperCase();
  if (!isStablecoinAsset(code)) return null;
  const now = opts.now ?? Date.now();

  const hit = getLastGoodUsdPrice(code, now);
  if (
    hit &&
    hit.ageMs <= PEG_LAST_KNOWN_MAX_AGE_MS &&
    isWithinPeg(hit.quote.rate, opts.depegThresholdBps)
  ) {
    return {
      ...hit.quote,
      source: `peg_fallback:${hit.quote.source}`,
      stale: true,
      rateWarning: `peg_fallback_last_known:${Math.round(hit.ageMs / 1000)}s`,
    };
  }

  try {
    const ref = await fetchChainlinkUsd(code, opts.fetchImpl ?? fetch);
    if (ref && isWithinPeg(ref.rate, opts.depegThresholdBps)) {
      return {
        rate: ref.rate,
        source: "peg_fallback:chainlink",
        fetchedAt: nowIso(),
        sources: [],
        referenceRate: ref.rate,
        referenceSource: "chainlink",
        rateWarning: "peg_fallback_chainlink",
        stale: false,
      };
    }
  } catch {
    /* no confirmation available */
  }
  return null;
}

/** Test helper: drop the short cache but keep the last good prices. */
export function expireUsdPriceCache() {
  cache.clear();
}

/** Test helper */
export function clearUsdPriceCache() {
  cache.clear();
  lastGood.clear();
  clearCoinGeckoBatch();
  resetVenueGuards();
}

export const USD_PRICE_CACHE_TTL_MS = CACHE_TTL_MS;
export const DEFAULT_RATE_VENUES = DEFAULT_VENUES;
export const DEFAULT_MIN_RATE_SOURCES = DEFAULT_MIN_SOURCES;
export { normalizeRate };
