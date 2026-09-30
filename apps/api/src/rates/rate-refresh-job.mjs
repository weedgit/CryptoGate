/**
 * Keeps the USD and EUR/USD price caches warm so checkout never waits on the
 * venues, and watches the result: when an asset stays below the required
 * source count, platform staff get a System health email (and another once
 * every feed is live again).
 */
import { notifyPlatform, PlatformNotificationEventType } from "../notifications/notify.mjs";
import { getEurUsdPrice } from "./eur-usd.mjs";
import { getPlatformPricingSettings } from "./pricing-settings-store.mjs";
import { recordRateSamples } from "./rate-samples-store.mjs";
import { RATE_ASSETS, STALE_MAX_AGE_MS, getUsdPrice } from "./usd-price.mjs";

export const RATE_REFRESH_INTERVAL_MS = 20_000;
/** Consecutive ticks before an alert (or its all-clear) is sent, so a single blip stays quiet. */
export const ALERT_AFTER_TICKS = 2;

/**
 * @typedef {{
 *   asset: string,
 *   state: "ok" | "stale" | "down" | "rejected",
 *   sources: number,
 *   detail: string | null,
 *   rate?: string,
 *   source?: string,
 * }} FeedAssetHealth
 */
/**
 * @typedef {{
 *   status: "ok" | "degraded" | "off" | "unknown",
 *   checkedAt: string | null,
 *   assets: FeedAssetHealth[],
 *   alertOpen: boolean,
 *   alertSince: string | null,
 * }} RateFeedHealth
 */

/** @type {RateFeedHealth} */
let health = { status: "unknown", checkedAt: null, assets: [], alertOpen: false, alertSince: null };
let degradedTicks = 0;
let okTicks = 0;

/** @returns {RateFeedHealth} */
export function getRateFeedHealth() {
  return health;
}

/**
 * @param {string} asset
 * @param {() => Promise<{ rate: string, source: string, sources: unknown[], stale?: boolean, rateWarning?: string | null }>} load
 * @returns {Promise<FeedAssetHealth>}
 */
async function checkOne(asset, load) {
  try {
    const q = await load();
    if (q.stale) {
      return { asset, state: "stale", sources: 0, detail: q.rateWarning ?? "stale_rate" };
    }
    return { asset, state: "ok", sources: q.sources.length, detail: null, rate: q.rate, source: q.source };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      asset,
      state: err?.code === "rate_reference_rejected" ? "rejected" : "down",
      sources: 0,
      detail: message,
    };
  }
}

/** @param {FeedAssetHealth} a */
function describe(a) {
  const staleMin = Math.round(STALE_MAX_AGE_MS / 60_000);
  if (a.state === "stale") {
    return `${a.asset}: not enough live sources — quotes reuse the last good price (up to ${staleMin} minutes old).`;
  }
  if (a.state === "rejected") {
    return `${a.asset}: exchange median disagrees with Chainlink — market quotes are refused. ${a.detail ?? ""}`.trim();
  }
  return `${a.asset}: no usable price — new market-priced orders fail (pegged stablecoin orders fall back to 1:1 when the peg is confirmed). ${a.detail ?? ""}`.trim();
}

/**
 * @param {RateFeedHealth} next
 * @param {(eventType: string, message: { subject: string, lines: string[], path?: string }) => void} notify
 */
function evaluateAlert(next, notify) {
  const bad = next.assets.filter((a) => a.state !== "ok");
  if (bad.length > 0) {
    degradedTicks += 1;
    okTicks = 0;
    if (!health.alertOpen && degradedTicks >= ALERT_AFTER_TICKS) {
      next.alertOpen = true;
      next.alertSince = next.checkedAt;
      notify(PlatformNotificationEventType.SystemHealth, {
        subject: `Rate feed degraded — ${bad.map((a) => a.asset).join(", ")}`,
        lines: [
          "Some prices can't be confirmed by enough exchanges right now.",
          ...bad.map(describe),
          "Check Rates & pricing → Feed status for each source.",
        ],
        path: "settings/rates",
      });
    }
    return;
  }
  okTicks += 1;
  degradedTicks = 0;
  if (health.alertOpen && okTicks >= ALERT_AFTER_TICKS) {
    next.alertOpen = false;
    next.alertSince = null;
    notify(PlatformNotificationEventType.SystemHealth, {
      subject: "Rate feed recovered",
      lines: ["Every asset is priced from live sources again."],
      path: "settings/rates",
    });
  }
}

/**
 * One refresh pass: warm every price cache and update feed health.
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   notify?: (eventType: string, message: { subject: string, lines: string[], path?: string }) => void,
 *   loadSettings?: typeof getPlatformPricingSettings,
 *   recordSamples?: typeof recordRateSamples,
 * }} [opts]
 */
export async function refreshRatesOnce(opts = {}) {
  const notify = opts.notify ?? notifyPlatform;
  const platform = await (opts.loadSettings ?? getPlatformPricingSettings)();
  const checkedAt = new Date().toISOString();
  if (!platform.ratesEnabled) {
    degradedTicks = 0;
    okTicks = 0;
    health = { status: "off", checkedAt, assets: [], alertOpen: false, alertSince: null };
    return health;
  }
  const assets = await Promise.all([
    ...RATE_ASSETS.map((asset) =>
      checkOne(asset, () =>
        getUsdPrice(asset, {
          fetchImpl: opts.fetchImpl,
          bypassCache: true,
          minSources: platform.minRateSources,
          venues: platform.rateVenues,
          chainlinkReferenceEnabled: platform.chainlinkReferenceEnabled,
          referenceDeviationBps: platform.referenceDeviationBps,
        }),
      ),
    ),
    checkOne("EUR/USD", () =>
      getEurUsdPrice({
        fetchImpl: opts.fetchImpl,
        bypassCache: true,
        minSources: Math.min(2, platform.minRateSources),
      }),
    ),
  ]);
  const live = assets.filter((a) => a.state === "ok" && a.rate && a.asset !== "EUR/USD");
  try {
    await (opts.recordSamples ?? recordRateSamples)(
      live.map((a) => ({ asset: a.asset, rate: String(a.rate), source: String(a.source) })),
    );
  } catch (err) {
    if (process.env.NODE_ENV !== "test") console.error("rate sample insert failed", err);
  }
  /** @type {RateFeedHealth} */
  const next = {
    status: assets.every((a) => a.state === "ok") ? "ok" : "degraded",
    checkedAt,
    assets: assets.map(({ rate: _r, source: _s, ...a }) => a),
    alertOpen: health.alertOpen,
    alertSince: health.alertSince,
  };
  evaluateAlert(next, notify);
  health = next;
  return health;
}

/** Test hook. */
export function resetRateFeedHealth() {
  health = { status: "unknown", checkedAt: null, assets: [], alertOpen: false, alertSince: null };
  degradedTicks = 0;
  okTicks = 0;
}

/**
 * @param {{ intervalMs?: number, enabled?: boolean }} [options]
 */
export function startRateRefreshJob(options = {}) {
  const enabled =
    options.enabled ??
    !(
      process.env.RATE_REFRESH_ENABLED === "0" ||
      process.env.RATE_REFRESH_ENABLED === "false"
    );
  if (!enabled) return { stop() {} };

  const raw = options.intervalMs ?? Number(process.env.RATE_REFRESH_INTERVAL_MS ?? RATE_REFRESH_INTERVAL_MS);
  const intervalMs = Number.isFinite(raw) && raw >= 5_000 ? raw : RATE_REFRESH_INTERVAL_MS;

  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await refreshRatesOnce();
    } catch (err) {
      if (process.env.NODE_ENV !== "test") console.error("rate refresh tick failed", err);
    } finally {
      running = false;
    }
  };

  const handle = setInterval(() => void run(), intervalMs);
  if (typeof handle.unref === "function") handle.unref();
  void run();

  return {
    stop() {
      clearInterval(handle);
    },
  };
}
