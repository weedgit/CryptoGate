import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyPricingPolicy,
  buildLockedQuote,
  quotePayAmount,
  toBaseUnits,
} from "./pricing.mjs";
import { clearUsdPriceCache, getUsdPrice } from "./usd-price.mjs";
import { deviationBps, medianRate } from "./median.mjs";
import { decodeChainlinkAnswer } from "./chainlink-reference.mjs";

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
      // eth_call RPC — return answer=2500 USD (8 decimals)
      if (init?.method === "POST") {
        const roundId = "0".repeat(63) + "1";
        const answer = (2500n * 10n ** 8n).toString(16).padStart(64, "0");
        const rest = "0".repeat(64 * 3);
        return {
          ok: true,
          status: 200,
          json: async () => ({ result: `0x${roundId}${answer}${rest}` }),
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
