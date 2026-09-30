/**
 * One CoinGecko call prices every asset in USD and EUR. The free plans are
 * rate-limited (Demo key: ~10k calls/month), so a successful response is
 * reused for COINGECKO_MIN_INTERVAL_MS instead of being fetched per asset.
 */
import { VENUE_TIMEOUT_MS, guardVenue } from "./venue-guard.mjs";

export const COINGECKO_IDS = ["ethereum", "tron", "tether", "usd-coin"];

/** Without a key the public API throttles per minute; with a Demo key the monthly cap binds. */
export function coinGeckoMinIntervalMs() {
  const fromEnv = Number(process.env.COINGECKO_MIN_INTERVAL_MS);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) return fromEnv;
  return (process.env.COINGECKO_DEMO_API_KEY ?? "").trim() ? 300_000 : 60_000;
}

/** @type {{ body: Record<string, { usd?: number, eur?: number }>, at: number } | null} */
let last = null;
/** @type {Promise<Record<string, { usd?: number, eur?: number }>> | null} */
let inflight = null;

/** @param {typeof fetch} fetchImpl */
async function fetchBatch(fetchImpl) {
  const url =
    `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_IDS.join(",")}` +
    "&vs_currencies=usd,eur";
  const headers = { Accept: "application/json" };
  const demoKey = (process.env.COINGECKO_DEMO_API_KEY ?? "").trim();
  if (demoKey) headers["x-cg-demo-api-key"] = demoKey;
  const res = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(VENUE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`coingecko_http_${res.status}`);
  const body = await res.json();
  if (!body || typeof body !== "object") throw new Error("coingecko_bad_payload");
  return body;
}

/**
 * @param {typeof fetch} fetchImpl
 * @param {{ fresh?: boolean }} [opts] fresh skips the reuse window (status probe)
 * @returns {Promise<{ body: Record<string, { usd?: number, eur?: number }>, ageMs: number }>}
 */
export async function getCoinGeckoBatch(fetchImpl, opts = {}) {
  const now = Date.now();
  if (!opts.fresh && last && now - last.at < coinGeckoMinIntervalMs()) {
    return { body: last.body, ageMs: now - last.at };
  }
  if (!inflight) {
    inflight = guardVenue("coingecko", () => fetchBatch(fetchImpl)).finally(() => {
      inflight = null;
    });
  }
  const body = await inflight;
  last = { body, at: Date.now() };
  return { body, ageMs: 0 };
}

export function clearCoinGeckoBatch() {
  last = null;
  inflight = null;
}
