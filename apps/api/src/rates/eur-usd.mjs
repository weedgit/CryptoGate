/**
 * EUR/USD median feed (same venues + cache pattern as asset USD prices).
 * Every source is a real EUR/USD value: Binance only lists EUR/USDT, so it is
 * converted with a USDT/USD price from a venue that quotes USD.
 */
import { medianRate, normalizeRate } from "./median.mjs";
import { divideDecimals, multiplyDecimals } from "./pricing.mjs";

const CACHE_TTL_MS = 45_000;

/** @type {{ quote: { rate: string, source: string, fetchedAt: string, sources: Array<{source:string,rate:string}> }, expiresAt: number } | null} */
let cache = null;

function nowIso() {
  return new Date().toISOString();
}

/** EUR price in USDT (not USD). */
async function fetchBinanceEurUsdt(fetchImpl) {
  const url = "https://api.binance.com/api/v3/ticker/price?symbol=EURUSDT";
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`binance_http_${res.status}`);
  const body = await res.json();
  return normalizeRate(body.price);
}

/** Tether priced in both USD and EUR; usd/eur is EUR/USD and usd is USDT/USD. */
async function fetchCoinGeckoTether(fetchImpl) {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd,eur";
  const headers = { Accept: "application/json" };
  const demoKey = (process.env.COINGECKO_DEMO_API_KEY ?? "").trim();
  if (demoKey) headers["x-cg-demo-api-key"] = demoKey;
  const res = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`coingecko_http_${res.status}`);
  const body = await res.json();
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
  const url = `https://api.kraken.com/0/public/Ticker?pair=${pair}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`kraken_http_${res.status}`);
  const body = await res.json();
  if (body?.error?.length) throw new Error(`kraken_error:${body.error[0]}`);
  const entry = body?.result?.[pair] ?? Object.values(body?.result ?? {})[0];
  return normalizeRate(entry?.c?.[0]);
}

/**
 * @param {PromiseSettledResult<T>} r
 * @template T
 * @returns {T | null}
 */
function valueOf(r) {
  return r.status === "fulfilled" ? r.value : null;
}

/**
 * @param {{ fetchImpl?: typeof fetch, bypassCache?: boolean, minSources?: number }} [opts]
 */
export async function getEurUsdPrice(opts = {}) {
  if (!opts.bypassCache && cache && cache.expiresAt > Date.now()) {
    return cache.quote;
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const minSources = Number.isFinite(opts.minSources)
    ? Math.max(1, Number(opts.minSources))
    : 2;
  const [binanceEurUsdt, gecko, krakenEurUsd, krakenUsdtUsd] = (
    await Promise.allSettled([
      fetchBinanceEurUsdt(fetchImpl),
      fetchCoinGeckoTether(fetchImpl),
      fetchKrakenLast(fetchImpl, "ZEURZUSD"),
      fetchKrakenLast(fetchImpl, "USDTZUSD"),
    ])
  ).map(valueOf);

  /** @type {Array<{ source: string, rate: string }>} */
  const healthy = [];
  if (gecko) {
    healthy.push({ source: "coingecko", rate: divideDecimals(gecko.usd, gecko.eur) });
  }
  if (krakenEurUsd) {
    healthy.push({ source: "kraken", rate: krakenEurUsd });
  }
  const usdtUsd = krakenUsdtUsd ?? gecko?.usd ?? null;
  if (binanceEurUsdt && usdtUsd) {
    healthy.push({ source: "binance", rate: multiplyDecimals(binanceEurUsdt, usdtUsd) });
  }

  if (healthy.length < minSources) {
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
  return quote;
}

export function clearEurUsdPriceCache() {
  cache = null;
}
