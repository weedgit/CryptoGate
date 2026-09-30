import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyPricingPolicy,
  buildLockedQuote,
  quotePayAmount,
  toBaseUnits,
} from "./pricing.mjs";
import { clearUsdPriceCache, getUsdPrice, minVenueCoverage } from "./usd-price.mjs";
import { deviationBps, medianRate } from "./median.mjs";
import { FEEDS, decodeChainlinkAnswer } from "./chainlink-reference.mjs";
import { clearEurUsdPriceCache, getEurUsdPrice } from "./eur-usd.mjs";
import { isWithinPeg } from "./pricing.mjs";

const nowSec = () => Math.floor(Date.now() / 1000);

/** latestRoundData() return: roundId, answer, startedAt, updatedAt, answeredInRound. */
function roundData(answer, updatedAt) {
  const w = (n) => BigInt(n).toString(16).padStart(64, "0");
  return `0x${w(1)}${w(answer)}${w(updatedAt)}${w(updatedAt)}${w(1)}`;
}

function jsonRes(body, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

describe("pricing engine", () => {
  it("converts major units to base units", () => {
    assert.equal(toBaseUnits("100.25", 6), "100250000");
    assert.equal(toBaseUnits("0.025", 18), "25000000000000000");
  });

  it("quotes pay amount from USD / rate", () => {
    const q = quotePayAmount("100", "4000", 18);
    assert.equal(q.payAmount, "0.025");
    assert.equal(q.payAmountBaseUnits, "25000000000000000");
  });

  it("pegs stablecoins within threshold", () => {
    const peg = applyPricingPolicy({
      asset: "USDT",
      merchantMode: "pegged_1to1",
      marketRate: "0.9996",
      depegThresholdBps: 100,
    });
    assert.equal(peg.pricingMode, "pegged_1to1");
    assert.equal(peg.pricingRate, "1");
  });

  it("switches to depeg market outside threshold", () => {
    const deg = applyPricingPolicy({
      asset: "USDC",
      merchantMode: "pegged_1to1",
      marketRate: "0.985",
      depegThresholdBps: 100,
    });
    assert.equal(deg.pricingMode, "depeg_market");
    assert.equal(deg.pricingRate, "0.985");
  });

  it("always uses market for ETH", () => {
    const m = applyPricingPolicy({
      asset: "ETH",
      merchantMode: "pegged_1to1",
      marketRate: "4000",
    });
    assert.equal(m.pricingMode, "market");
    assert.equal(m.pricingRate, "4000");
  });

  it("builds a locked quote with expiry and evidence", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const q = buildLockedQuote({
      invoiceUsd: "100",
      asset: "ETH",
      decimals: 18,
      merchantMode: "market",
      marketRate: "4000",
      rateSource: "median:binance,kraken,coingecko",
      rateFetchedAt: now.toISOString(),
      rateSources: [
        { source: "binance", rate: "3990" },
        { source: "kraken", rate: "4000" },
        { source: "coingecko", rate: "4010" },
      ],
      referenceRate: "4005",
      referenceSource: "chainlink",
      quoteLockSeconds: 900,
      now,
    });
    assert.equal(q.payAmount, "0.025");
    assert.equal(q.quoteExpiresAt, "2026-01-01T00:15:00.000Z");
    assert.equal(q.pricingMode, "market");
    assert.equal(q.rateSources?.length, 3);
    assert.equal(q.referenceSource, "chainlink");
  });

  it("locks exact crypto invoices without FX pay rewrite", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const q = buildLockedQuote({
      invoiceUsd: "0",
      invoiceDenomination: "crypto",
      exactPayAmount: "0.5",
      asset: "ETH",
      decimals: 18,
      merchantMode: "market",
      marketRate: "4000",
      rateSource: "median:binance",
      rateFetchedAt: now.toISOString(),
      quoteLockSeconds: 900,
      now,
    });
    assert.equal(q.payAmount, "0.5");
    assert.equal(q.pricingMode, "crypto_exact");
    assert.equal(q.invoiceAmountUsd, "2000");
    assert.equal(q.invoiceDenomination, "crypto");
  });
});

describe("median math", () => {
  it("medians three rates", () => {
    assert.equal(medianRate(["10", "30", "20"]), "20");
  });

  it("averages even count", () => {
    assert.equal(medianRate(["10", "20"]), "15");
  });

  it("computes deviation bps", () => {
    assert.equal(deviationBps("101", "100"), 100);
    assert.equal(deviationBps("98.5", "100"), 150);
  });
});

describe("chainlink decode", () => {
  it("decodes latestRoundData answer word", () => {
    // roundId=1, answer=2500_00000000 (2500 with 8 decimals)
    const roundId = "0".repeat(63) + "1";
    const answer = (2500n * 10n ** 8n).toString(16).padStart(64, "0");
    const rest = "0".repeat(64 * 3);
    const hex = `0x${roundId}${answer}${rest}`;
    assert.equal(decodeChainlinkAnswer(hex, 8), "2500");
  });

  it("rejects answers older than the feed's max age", () => {
    const now = 1_800_000_000;
    const fresh = roundData(99_990_000n, now - 3600);
    const stale = roundData(99_990_000n, now - 27 * 3600);
    assert.equal(decodeChainlinkAnswer(fresh, 8, 26 * 3600, now), "0.9999");
    assert.throws(() => decodeChainlinkAnswer(stale, 8, 26 * 3600, now), /chainlink_stale/);
  });

  it("every feed address is a 20-byte hex address with a max age", () => {
    for (const [asset, feed] of Object.entries(FEEDS)) {
      assert.match(feed.address, /^0x[0-9a-fA-F]{40}$/, asset);
      assert.ok(feed.maxAgeSeconds > 0, asset);
    }
    assert.equal(FEEDS.USDC.address.toLowerCase(), "0x8fffffd4afb6115b954bd326cbe7b4ba576818f6");
  });
});

describe("exact peg check", () => {
  it("pegs strictly inside the threshold, no float rounding at the edge", () => {
    assert.equal(isWithinPeg("0.99", 100), false);
    assert.equal(isWithinPeg("1.01", 100), false);
    assert.equal(isWithinPeg("0.990000000000000001", 100), true);
    assert.equal(isWithinPeg("1.009999999999999999", 100), true);
    assert.equal(isWithinPeg("1", 0), false);
    assert.equal(isWithinPeg("not-a-rate", 100), false);
  });

  it("applyPricingPolicy uses the exact edge", () => {
    const edge = applyPricingPolicy({
      asset: "USDT",
      merchantMode: "pegged_1to1",
      marketRate: "0.99",
      depegThresholdBps: 100,
    });
    assert.equal(edge.pricingMode, "depeg_market");
    const inside = applyPricingPolicy({
      asset: "USDT",
      merchantMode: "pegged_1to1",
      marketRate: "0.9900001",
      depegThresholdBps: 100,
    });
    assert.equal(inside.pricingMode, "pegged_1to1");
  });
});

describe("USDT sources", () => {
  it("never counts Binance for USDT (no fake constant source)", async () => {
    clearUsdPriceCache();
    const seen = [];
    const fetchImpl = async (url) => {
      const u = String(url);
      seen.push(u);
      if (u.includes("binance")) return jsonRes({ price: "1" });
      if (u.includes("coingecko")) return jsonRes({ tether: { usd: 0.9990 } });
      if (u.includes("kraken")) return jsonRes({ result: { USDTZUSD: { c: ["0.9994", "1"] } }, error: [] });
      throw new Error(`unexpected:${u}`);
    };
    const q = await getUsdPrice("USDT", { fetchImpl, bypassCache: true, minSources: 2 });
    assert.deepEqual(q.sources.map((s) => s.source).sort(), ["coingecko", "kraken"]);
    assert.equal(q.rate, "0.9992");
    assert.ok(!seen.some((u) => u.includes("binance")));
  });

  it("fails closed when only one real USDT source answers", async () => {
    clearUsdPriceCache();
    const fetchImpl = async (url) => {
      const u = String(url);
      if (u.includes("kraken")) return jsonRes({ result: { USDTZUSD: { c: ["0.9994", "1"] } }, error: [] });
      return jsonRes({}, false);
    };
    await assert.rejects(
      () => getUsdPrice("USDT", { fetchImpl, bypassCache: true, minSources: 2 }),
      (err) => err?.code === "rates_unavailable",
    );
  });

  it("venue coverage limits the minimum source count", () => {
    assert.equal(minVenueCoverage(["binance", "coingecko", "kraken"]), 2);
    assert.equal(minVenueCoverage(["binance", "kraken"]), 1);
    assert.equal(minVenueCoverage(["coingecko", "kraken"]), 2);
  });
});

describe("EUR/USD feed", () => {
  const eurFetch = ({ binance = true, gecko = true, krakenEur = true, krakenUsdt = true } = {}) =>
    async (url) => {
      const u = String(url);
      if (u.includes("binance")) return binance ? jsonRes({ price: "1.1300" }) : jsonRes({}, false);
      if (u.includes("coingecko")) {
        return gecko ? jsonRes({ tether: { usd: 0.999, eur: 0.9 } }) : jsonRes({}, false);
      }
      if (u.includes("ZEURZUSD")) {
        return krakenEur ? jsonRes({ result: { ZEURZUSD: { c: ["1.1100", "1"] } }, error: [] }) : jsonRes({}, false);
      }
      if (u.includes("USDTZUSD")) {
        return krakenUsdt ? jsonRes({ result: { USDTZUSD: { c: ["0.9980", "1"] } }, error: [] }) : jsonRes({}, false);
      }
      throw new Error(`unexpected:${u}`);
    };

  it("uses true EUR/USD from each venue", async () => {
    clearEurUsdPriceCache();
    const q = await getEurUsdPrice({ fetchImpl: eurFetch(), bypassCache: true });
    const by = Object.fromEntries(q.sources.map((s) => [s.source, s.rate]));
    assert.equal(by.coingecko, "1.11");
    assert.equal(by.kraken, "1.11");
    assert.equal(by.binance, "1.12774");
    assert.equal(q.rate, "1.11");
  });

  it("converts Binance with CoinGecko USDT/USD when Kraken USDT is down", async () => {
    clearEurUsdPriceCache();
    const q = await getEurUsdPrice({ fetchImpl: eurFetch({ krakenUsdt: false }), bypassCache: true });
    const by = Object.fromEntries(q.sources.map((s) => [s.source, s.rate]));
    assert.equal(by.binance, "1.12887");
  });

  it("drops Binance when no USDT/USD price is available", async () => {
    clearEurUsdPriceCache();
    const q = await getEurUsdPrice({
      fetchImpl: eurFetch({ gecko: false, krakenUsdt: false }),
      bypassCache: true,
      minSources: 1,
    });
    assert.deepEqual(q.sources.map((s) => s.source), ["kraken"]);
  });
});

describe("usd price feed", () => {
  it("computes median of healthy venues", async () => {
    clearUsdPriceCache();
    const fetchImpl = async (url) => {
      const u = String(url);
      if (u.includes("binance")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ price: "3990" }),
        };
      }
      if (u.includes("coingecko")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ethereum: { usd: 4010 } }),
        };
      }
      if (u.includes("kraken")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: { XETHZUSD: { c: ["4000", "1"] } },
            error: [],
          }),
        };
      }
      throw new Error(`unexpected:${u}`);
    };
    const quote = await getUsdPrice("ETH", {
      fetchImpl,
      bypassCache: true,
      minSources: 2,
      venues: ["binance", "coingecko", "kraken"],
    });
    assert.equal(quote.rate, "4000");
    assert.match(quote.source, /^median:/);
    assert.equal(quote.sources.length, 3);
  });

  it("fails closed with a single healthy source when min is 2", async () => {
    clearUsdPriceCache();
    const fetchImpl = async (url) => {
      const u = String(url);
      if (u.includes("binance")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ price: "4000" }),
        };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    };
    await assert.rejects(
      () =>
        getUsdPrice("ETH", {
          fetchImpl,
          bypassCache: true,
          minSources: 2,
          venues: ["binance", "coingecko", "kraken"],
        }),
      (err) => err?.code === "rates_unavailable",
    );
  });

  it("rejects volatile assets beyond Chainlink band", async () => {
    clearUsdPriceCache();
    const fetchImpl = async (url, init) => {
      const u = String(url);
      if (u.includes("binance") || u.includes("kraken") || u.includes("coingecko")) {
        if (u.includes("binance")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ price: "5000" }),
          };
        }
        if (u.includes("coingecko")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ethereum: { usd: 5000 } }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: { XETHZUSD: { c: ["5000", "1"] } },
            error: [],
          }),
        };
      }
      // eth_call RPC — return answer=2500 USD (8 decimals), updated just now
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ result: roundData(2500n * 10n ** 8n, nowSec()) }),
        };
      }
      throw new Error(`unexpected:${u}`);
    };
    await assert.rejects(
      () =>
        getUsdPrice("ETH", {
          fetchImpl,
          bypassCache: true,
          minSources: 2,
          venues: ["binance", "coingecko", "kraken"],
          chainlinkReferenceEnabled: true,
          referenceDeviationBps: 150,
        }),
      (err) => err?.code === "rate_reference_rejected",
    );
  });
});
