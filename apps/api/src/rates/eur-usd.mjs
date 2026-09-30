/**
 * EUR/USD median feed (same venues + cache pattern as asset USD prices).
 * Every source is a real EUR/USD value: Binance only lists EUR/USDT, so it is
 * converted with a USDT/USD price from a venue that quotes USD.
 */
import { medianRate, normalizeRate } from "./median.mjs";
import { divideDecimals, multiplyDecimals } from "./pricing.mjs";
import { clearCoinGeckoBatch, getCoinGeckoBatch } from "./coingecko-batch.mjs";
import { VENUE_TIMEOUT_MS, guardVenue } from "./venue-guard.mjs";

const CACHE_TTL_MS = 45_000;
const STALE_MAX_AGE_MS = 10 * 60_000;

/** Venues that can produce a EUR/USD value (Coinbase has no EUR/USD market). */
export const EUR_USD_VENUES = ["binance", "coingecko", "kraken", "bitstamp"];

/** @typedef {{ rate: string, source: string, fetchedAt: string, sources: Array<{source:string,rate:string}>, stale?: boolean, rateWarning?: string | null }} EurUsdQuote */

/** @type {{ quote: EurUsdQuote, expiresAt: number } | null} */
let cache = null;
/** @type {{ quote: EurUsdQuote, at: number } | null} */
let lastGood = null;

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {typeof fetch} fetchImpl
 * @param {string} url
 * @param {string} prefix
 */
async function getJson(fetchImpl, url, prefix) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(VENUE_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${prefix}_http_${res.status}`);
  return res.json();
}

/** EUR price in USDT (not USD). */
async function fetchBinanceEurUsdt(fetchImpl) {
  const body = await getJson(
    fetchImpl,
    "https://api.binance.com/api/v3/ticker/price?symbol=EURUSDT",
    "binance",
  );
  return normalizeRate(body.price);
}

/** Tether priced in both USD and EUR; usd/eur is EUR/USD and usd is USDT/USD. */
async function fetchCoinGeckoTether(fetchImpl) {
  const { body } = await getCoinGeckoBatch(fetchImpl);
  const usd = body?.tether?.usd;
  const eur = body?.tether?.eur;
  if (!usd || !eur) throw new Error("coingecko_tether_missing");
  return { usd: normalizeRate(usd), eur: normalizeRate(eur) };
}

/**
 * @param {typeof fetch} fetchImpl
 * @param {string} pair
 */
async function fetchKrakenLast(fetchImpl, pair) {
  const body = await getJson(
    fetchImpl,
    `https://api.kraken.com/0/public/Ticker?pair=${pair}`,
    "kraken",
  );
  if (body?.error?.length) throw new Error(`kraken_error:${body.error[0]}`);
  const entry = body?.result?.[pair] ?? Object.values(body?.result ?? {})[0];
  return normalizeRate(entry?.c?.[0]);
}

async function fetchBitstampEurUsd(fetchImpl) {
  const body = await getJson(fetchImpl, "https://www.bitstamp.net/api/v2/ticker/eurusd/", "bitstamp");
  return normalizeRate(body?.last);
}

/**
 * @param {PromiseSettledResult<T>} r
 * @template T
 * @returns {T | null}
 */
function valueOf(r) {
  return r.status === "fulfilled" ? r.value : null;
}

/** @param {PromiseSettledResult<unknown>} r */
function reasonOf(r) {
  if (r.status === "fulfilled") return null;
  return r.reason instanceof Error ? r.reason.message : String(r.reason);
}

/**
 * EUR/USD sources with the reason each failed source was dropped.
 * `guarded` routes calls through the per-source circuit breaker (quotes);
 * the status probe leaves it off to see every source's real state.
 * @param {typeof fetch} [fetchImpl]
 * @param {{ guarded?: boolean }} [opts]
 */
export async function probeEurUsdSources(fetchImpl = fetch, opts = {}) {
  /** @type {<T>(key: string, fn: () => Promise<T>) => Promise<T>} */
  const run = opts.guarded ? guardVenue : (_key, fn) => fn();
  const settled = await Promise.allSettled([
    run("binance:EURUSDT", () => fetchBinanceEurUsdt(fetchImpl)),
    fetchCoinGeckoTether(fetchImpl),
    run("kraken:EURUSD", () => fetchKrakenLast(fetchImpl, "ZEURZUSD")),
    run("kraken:USDT", () => fetchKrakenLast(fetchImpl, "USDTZUSD")),
    run("bitstamp:EURUSD", () => fetchBitstampEurUsd(fetchImpl)),
  ]);
  const [binanceEurUsdt, gecko, krakenEurUsd, krakenUsdtUsd, bitstampEurUsd] =
    settled.map(valueOf);

  /** @type {Array<{ source: string, rate: string }>} */
  const sources = [];
  /** @type {Array<{ source: string, error: string }>} */
  const errors = [];
  if (gecko) {
    sources.push({ source: "coingecko", rate: divideDecimals(gecko.usd, gecko.eur) });
  } else {
    errors.push({ source: "coingecko", error: reasonOf(settled[1]) ?? "no_rate" });
  }
  if (krakenEurUsd) {
    sources.push({ source: "kraken", rate: krakenEurUsd });
  } else {
    errors.push({ source: "kraken", error: reasonOf(settled[2]) ?? "no_rate" });
  }
  const usdtUsd = krakenUsdtUsd ?? gecko?.usd ?? null;
  if (binanceEurUsdt && usdtUsd) {
    sources.push({ source: "binance", rate: multiplyDecimals(binanceEurUsdt, usdtUsd) });
  } else {
    errors.push({
      source: "binance",
      error: binanceEurUsdt ? "usdt_usd_unavailable" : reasonOf(settled[0]) ?? "no_rate",
    });
  }
  if (bitstampEurUsd) {
    sources.push({ source: "bitstamp", rate: bitstampEurUsd });
  } else {
    errors.push({ source: "bitstamp", error: reasonOf(settled[4]) ?? "no_rate" });
  }
  return { sources, errors };
}

/**
 * @param {{ fetchImpl?: typeof fetch, bypassCache?: boolean, minSources?: number }} [opts]
 * @returns {Promise<EurUsdQuote>}
 */
export async function getEurUsdPrice(opts = {}) {
  if (!opts.bypassCache && cache && cache.expiresAt > Date.now()) {
    return cache.quote;
  }
  const minSources = Number.isFinite(opts.minSources)
    ? Math.max(1, Number(opts.minSources))
    : 2;
  const { sources: healthy } = await probeEurUsdSources(opts.fetchImpl ?? fetch, {
    guarded: true,
  });

  if (healthy.length < minSources) {
    const ageMs = lastGood ? Date.now() - lastGood.at : Infinity;
    if (lastGood && ageMs <= STALE_MAX_AGE_MS) {
      return {
        ...lastGood.quote,
        stale: true,
        rateWarning: `stale_rate:${Math.round(ageMs / 1000)}s`,
      };
    }
    const e = new Error("rates_unavailable");
    e.code = "rates_unavailable";
    e.message = `Need at least ${minSources} EUR/USD sources (got ${healthy.length})`;
    throw e;
  }
  const rate = medianRate(healthy.map((h) => h.rate));
  const quote = {
    rate,
    source: `median:${healthy.map((h) => h.source).join(",")}`,
    fetchedAt: nowIso(),
    sources: healthy,
  };
  cache = { quote, expiresAt: Date.now() + CACHE_TTL_MS };
  lastGood = { quote, at: Date.now() };
  return quote;
}

/** Last successful EUR/USD median, whatever its age. */
export function getLastGoodEurUsdPrice(now = Date.now()) {
  return lastGood ? { quote: lastGood.quote, ageMs: now - lastGood.at } : null;
}

export function clearEurUsdPriceCache() {
  cache = null;
  lastGood = null;
  clearCoinGeckoBatch();
}
