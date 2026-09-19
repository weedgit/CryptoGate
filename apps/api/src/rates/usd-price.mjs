/**
 * Phase 2 USD price feed: parallel multi-venue median + optional Chainlink reference.
 * Cache TTL 45s. Fail closed when healthy sources < minSources (default 2).
 */

import { isStablecoinAsset } from "@paymentgate/domain";
import { deviationBps, medianRate, normalizeRate } from "./median.mjs";
import { fetchChainlinkUsd } from "./chainlink-reference.mjs";

const CACHE_TTL_MS = 45_000;

export const RATE_VENUES = ["binance", "coingecko", "kraken"];

/** @typedef {'binance' | 'coingecko' | 'kraken'} RateVenue */
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
 * }} UsdPriceQuote
 */

/** @type {Map<string, { quote: UsdPriceQuote, expiresAt: number }>} */
const cache = new Map();

const BINANCE_SYMBOL = {
  ETH: "ETHUSDT",
  TRX: "TRXUSDT",
  BTC: "BTCUSDT",
  USDT: "USDTUSD",
  USDC: "USDCUSDT",
};

const COINGECKO_ID = {
  ETH: "ethereum",
  TRX: "tron",
  BTC: "bitcoin",
  USDT: "tether",
  USDC: "usd-coin",
};

/** Kraken pair ids in ticker response. */
const KRAKEN_PAIR = {
  ETH: "XETHZUSD",
  TRX: "TRXUSD",
  BTC: "XXBTZUSD",
  USDT: "USDTZUSD",
  USDC: "USDCUSD",
};

const DEFAULT_VENUES = ["binance", "coingecko", "kraken"];
const DEFAULT_MIN_SOURCES = 2;
export const DEFAULT_REFERENCE_DEVIATION_BPS = 150;

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {string} asset
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<VenueRate>}
 */
async function fetchBinance(asset, fetchImpl) {
  const symbol = BINANCE_SYMBOL[asset];
  if (!symbol) throw new Error(`binance_unsupported:${asset}`);

  if (asset === "USDT") {
    try {
      const url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) throw new Error(`binance_http_${res.status}`);
      const body = await res.json();
      return { source: "binance", rate: normalizeRate(body.price) };
    } catch {
      return { source: "binance", rate: "1" };
    }
  }

  const url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`binance_http_${res.status}`);
  const body = await res.json();
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
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`;
  const headers = { Accept: "application/json" };
  const demoKey = (process.env.COINGECKO_DEMO_API_KEY ?? "").trim();
  if (demoKey) headers["x-cg-demo-api-key"] = demoKey;
  const res = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`coingecko_http_${res.status}`);
  const body = await res.json();
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
  const url = `https://api.kraken.com/0/public/Ticker?pair=${pair}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`kraken_http_${res.status}`);
  const body = await res.json();
  if (body?.error?.length) throw new Error(`kraken_error:${body.error[0]}`);
  const result = body?.result ?? {};
  const entry = result[pair] ?? Object.values(result)[0];
  const last = entry?.c?.[0];
  return { source: "kraken", rate: normalizeRate(last) };
}

const FETCHERS = {
  binance: fetchBinance,
  coingecko: fetchCoinGecko,
  kraken: fetchKraken,
};

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
    .filter((v) => v in FETCHERS);
  const minSources = Number.isFinite(opts.minSources)
    ? Math.max(1, Number(opts.minSources))
    : DEFAULT_MIN_SOURCES;

  const settled = await Promise.allSettled(
    venues.map((v) => FETCHERS[v](code, fetchImpl)),
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
    throw e;
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
  return quote;
}

/** Test helper */
export function clearUsdPriceCache() {
  cache.clear();
}

export const USD_PRICE_CACHE_TTL_MS = CACHE_TTL_MS;
export const DEFAULT_RATE_VENUES = DEFAULT_VENUES;
export const DEFAULT_MIN_RATE_SOURCES = DEFAULT_MIN_SOURCES;
export { normalizeRate };
