/**
 * EUR/USD median feed (same venues + cache pattern as asset USD prices).
 */
import { medianRate, normalizeRate } from "./median.mjs";

const CACHE_TTL_MS = 45_000;

/** @type {{ quote: { rate: string, source: string, fetchedAt: string, sources: Array<{source:string,rate:string}> }, expiresAt: number } | null} */
let cache = null;

function nowIso() {
  return new Date().toISOString();
}

async function fetchBinanceEurUsd(fetchImpl) {
  const url = "https://api.binance.com/api/v3/ticker/price?symbol=EURUSDT";
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`binance_http_${res.status}`);
  const body = await res.json();
  return { source: "binance", rate: normalizeRate(body.price) };
}

async function fetchCoinGeckoEurUsd(fetchImpl) {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=eur";
  const headers = { Accept: "application/json" };
  const demoKey = (process.env.COINGECKO_DEMO_API_KEY ?? "").trim();
  if (demoKey) headers["x-cg-demo-api-key"] = demoKey;
  const res = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`coingecko_http_${res.status}`);
  const body = await res.json();
  // tether priced in EUR → EUR per 1 USDT ≈ EURUSD inverse... use 1/eur
  const eurPerUsdt = body?.tether?.eur;
  if (!eurPerUsdt) throw new Error("coingecko_eur_missing");
  const eurusd = normalizeRate(1 / Number(eurPerUsdt));
  return { source: "coingecko", rate: eurusd };
}

async function fetchKrakenEurUsd(fetchImpl) {
  const url = "https://api.kraken.com/0/public/Ticker?pair=ZEURZUSD";
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`kraken_http_${res.status}`);
  const body = await res.json();
  if (body?.error?.length) throw new Error(`kraken_error:${body.error[0]}`);
  const entry = body?.result?.ZEURZUSD ?? Object.values(body?.result ?? {})[0];
  return { source: "kraken", rate: normalizeRate(entry?.c?.[0]) };
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
  const settled = await Promise.allSettled([
    fetchBinanceEurUsd(fetchImpl),
    fetchCoinGeckoEurUsd(fetchImpl),
    fetchKrakenEurUsd(fetchImpl),
  ]);
  const healthy = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value?.rate) healthy.push(r.value);
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
