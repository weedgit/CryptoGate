import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import {
  clearUsdPriceCache,
  getPegFallbackPrice,
  getUsdPrice,
  minVenueCoverage,
} from "./usd-price.mjs";
import { clearEurUsdPriceCache, getEurUsdPrice } from "./eur-usd.mjs";
import { refreshRatesOnce, resetRateFeedHealth } from "./rate-refresh-job.mjs";
import { breakerState } from "./venue-guard.mjs";

function jsonRes(body, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => body };
}

/** Every venue quoting `price` for any asset unless listed in `down`. */
function venues(price, { down = [], calls = [] } = {}) {
  return async (url, init) => {
    const u = String(url);
    calls.push(u);
    const host = init?.method === "POST" ? "chainlink" : new URL(u).hostname;
    const name = [
      ["binance", "binance"],
      ["coingecko", "coingecko"],
      ["kraken", "kraken"],
      ["coinbase", "coinbase"],
      ["bitstamp", "bitstamp"],
      ["chainlink", "chainlink"],
    ].find(([k]) => host.includes(k))?.[1];
    if (!name || down.includes(name)) return jsonRes({}, false);
    if (name === "binance") return jsonRes({ price });
    if (name === "coingecko") {
      const n = Number(price);
      return jsonRes({
        ethereum: { usd: n, eur: n },
        tron: { usd: n, eur: n },
        tether: { usd: n, eur: n / 1.1 },
        "usd-coin": { usd: n, eur: n },
      });
    }
    if (name === "kraken") {
      const pair = new URL(u).searchParams.get("pair");
      return jsonRes({ error: [], result: { [pair]: { c: [price, "1"] } } });
    }
    if (name === "coinbase") return jsonRes({ price });
    if (name === "bitstamp") return jsonRes({ last: price });
    return jsonRes({}, false);
  };
}

const base = { bypassCache: true, minSources: 2 };
const noop = async () => 0;

afterEach(() => {
  mock.timers.reset();
  clearUsdPriceCache();
  clearEurUsdPriceCache();
  resetRateFeedHealth();
});

describe("extra venues", () => {
  it("prices USDT from Coinbase and Bitstamp when CoinGecko and Kraken are down", async () => {
    const q = await getUsdPrice("USDT", {
      ...base,
      fetchImpl: venues("0.9995", { down: ["coingecko", "kraken"] }),
    });
    assert.deepEqual(q.sources.map((s) => s.source).sort(), ["bitstamp", "coinbase"]);
    assert.equal(q.rate, "0.9995");
  });

  it("never asks Coinbase for TRX or USDC", async () => {
    const calls = [];
    await getUsdPrice("TRX", { ...base, fetchImpl: venues("0.3", { calls }) });
    await getUsdPrice("USDC", { ...base, fetchImpl: venues("1", { calls }) });
    assert.ok(!calls.some((u) => u.includes("coinbase")));
  });

  it("every asset has four venues when all five are enabled", () => {
    assert.equal(
      minVenueCoverage(["binance", "coingecko", "kraken", "coinbase", "bitstamp"]),
      4,
    );
  });

  it("adds Bitstamp EUR/USD", async () => {
    const q = await getEurUsdPrice({
      bypassCache: true,
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes("bitstamp")) return jsonRes({ last: "1.135" });
        if (u.includes("ZEURZUSD")) return jsonRes({ error: [], result: { ZEURZUSD: { c: ["1.134", "1"] } } });
        return jsonRes({}, false);
      },
    });
    assert.deepEqual(q.sources.map((s) => s.source).sort(), ["bitstamp", "kraken"]);
  });
});

describe("CoinGecko budget", () => {
  it("one batched call serves every asset inside the reuse window", async () => {
    const calls = [];
    const fetchImpl = venues("1", { calls });
    await getUsdPrice("USDT", { ...base, fetchImpl });
    await getUsdPrice("USDC", { ...base, fetchImpl });
    await getUsdPrice("ETH", { ...base, fetchImpl });
    assert.equal(calls.filter((u) => u.includes("coingecko")).length, 1);
  });
});

describe("stale fallback", () => {
  it("reuses the last good median for up to 10 minutes, marked stale", async () => {
    mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
    const fresh = await getUsdPrice("ETH", { ...base, fetchImpl: venues("2700") });
    assert.equal(fresh.stale, undefined);

    mock.timers.tick(9 * 60_000);
    const down = venues("0", { down: ["binance", "coingecko", "kraken", "coinbase", "bitstamp"] });
    const stale = await getUsdPrice("ETH", { ...base, fetchImpl: down });
    assert.equal(stale.stale, true);
    assert.equal(stale.rate, "2700");
    assert.equal(stale.rateWarning, "stale_rate:540s");
    assert.equal(stale.fetchedAt, fresh.fetchedAt);

    mock.timers.tick(2 * 60_000);
    await assert.rejects(
      () => getUsdPrice("ETH", { ...base, fetchImpl: down }),
      (err) => err?.code === "rates_unavailable",
    );
  });

  it("does not paper over a Chainlink rejection", async () => {
    await getUsdPrice("ETH", { ...base, fetchImpl: venues("2700") });
    const nowSec = Math.floor(Date.now() / 1000);
    const word = (n) => BigInt(n).toString(16).padStart(64, "0");
    const rpc = async (url, init) => {
      if (init?.method === "POST") {
        return jsonRes({ result: `0x${word(1)}${word(1000n * 10n ** 8n)}${word(nowSec)}${word(nowSec)}${word(1)}` });
      }
      return venues("2700")(url, init);
    };
    await assert.rejects(
      () => getUsdPrice("ETH", { ...base, fetchImpl: rpc, chainlinkReferenceEnabled: true }),
      (err) => err?.code === "rate_reference_rejected",
    );
  });
});

describe("circuit breaker", () => {
  it("pauses a source after three straight failures", async () => {
    const calls = [];
    const fetchImpl = venues("2700", { down: ["kraken"], calls });
    for (let i = 0; i < 4; i += 1) {
      await getUsdPrice("ETH", { ...base, fetchImpl });
    }
    assert.equal(calls.filter((u) => u.includes("kraken")).length, 3);
    assert.equal(breakerState("kraken:ETH").paused, true);
    assert.equal(breakerState("binance:ETH").paused, false);
  });
});

describe("pegged stablecoin fallback", () => {
  it("uses a last known in-peg median up to an hour old", async () => {
    mock.timers.enable({ apis: ["Date"], now: 5_000_000 });
    await getUsdPrice("USDT", { ...base, fetchImpl: venues("0.9996") });
    mock.timers.tick(30 * 60_000);
    const fb = await getPegFallbackPrice("USDT", {
      depegThresholdBps: 100,
      fetchImpl: venues("0", { down: ["chainlink"] }),
    });
    assert.equal(fb?.rate, "0.9996");
    assert.equal(fb?.rateWarning, "peg_fallback_last_known:1800s");
  });

  it("falls back to Chainlink confirming the peg", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const word = (n) => BigInt(n).toString(16).padStart(64, "0");
    const fb = await getPegFallbackPrice("USDC", {
      depegThresholdBps: 100,
      fetchImpl: async () =>
        jsonRes({ result: `0x${word(1)}${word(99_990_000n)}${word(nowSec)}${word(nowSec)}${word(1)}` }),
    });
    assert.equal(fb?.rate, "0.9999");
    assert.equal(fb?.source, "peg_fallback:chainlink");
  });

  it("refuses when the last price was off-peg and Chainlink is unavailable", async () => {
    await getUsdPrice("USDT", { ...base, fetchImpl: venues("0.95") });
    const fb = await getPegFallbackPrice("USDT", {
      depegThresholdBps: 100,
      fetchImpl: async () => jsonRes({}, false),
    });
    assert.equal(fb, null);
  });

  it("never applies to volatile assets", async () => {
    await getUsdPrice("ETH", { ...base, fetchImpl: venues("2700") });
    assert.equal(await getPegFallbackPrice("ETH", { depegThresholdBps: 100 }), null);
  });
});

describe("feed alerts", () => {
  const settings = async () => ({
    ratesEnabled: true,
    minRateSources: 2,
    rateVenues: ["binance", "coingecko", "kraken", "coinbase", "bitstamp"],
    chainlinkReferenceEnabled: false,
    referenceDeviationBps: 150,
  });

  it("emails once after two bad ticks and once on recovery", async () => {
    const sent = [];
    const notify = (_type, msg) => sent.push(msg.subject);
    const bad = venues("1", { down: ["coingecko", "kraken", "coinbase", "bitstamp"] });
    const good = venues("1");

    let h = await refreshRatesOnce({ fetchImpl: bad, notify, loadSettings: settings, recordSamples: noop });
    assert.equal(h.status, "degraded");
    assert.equal(sent.length, 0);

    h = await refreshRatesOnce({ fetchImpl: bad, notify, loadSettings: settings, recordSamples: noop });
    assert.equal(h.alertOpen, true);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /^Rate feed degraded — /);
    assert.match(sent[0], /USDT/);

    await refreshRatesOnce({ fetchImpl: bad, notify, loadSettings: settings, recordSamples: noop });
    assert.equal(sent.length, 1);

    clearUsdPriceCache();
    clearEurUsdPriceCache();
    h = await refreshRatesOnce({ fetchImpl: good, notify, loadSettings: settings, recordSamples: noop });
    assert.equal(h.status, "ok");
    assert.equal(sent.length, 1);
    h = await refreshRatesOnce({ fetchImpl: good, notify, loadSettings: settings, recordSamples: noop });
    assert.equal(h.alertOpen, false);
    assert.deepEqual(sent.slice(1), ["Rate feed recovered"]);
  });

  it("samples live medians for the dashboard, never stale or EUR/USD", async () => {
    const recorded = [];
    await refreshRatesOnce({
      fetchImpl: venues("1"),
      notify: () => {},
      loadSettings: settings,
      recordSamples: async (rows) => {
        recorded.push(...rows);
        return rows.length;
      },
    });
    assert.deepEqual(recorded.map((r) => r.asset).sort(), ["ETH", "TRX", "USDC", "USDT"]);
    assert.ok(recorded.every((r) => r.rate === "1" && r.source.startsWith("median:")));
  });

  it("reports off and stays quiet when rates are disabled", async () => {
    const sent = [];
    const h = await refreshRatesOnce({
      fetchImpl: venues("1"),
      notify: () => sent.push(1),
      loadSettings: async () => ({ ...(await settings()), ratesEnabled: false }),
      recordSamples: noop,
    });
    assert.equal(h.status, "off");
    assert.equal(sent.length, 0);
  });
});
