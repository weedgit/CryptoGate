import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateCreateOrderBody } from "../orders/order-rules.mjs";
import { multiplyDecimals, buildLockedQuote } from "./pricing.mjs";
import { clearEurUsdPriceCache, getEurUsdPrice } from "./eur-usd.mjs";
import { clearUsdPriceCache, getUsdPrice } from "./usd-price.mjs";

describe("invoice denomination validation", () => {
  it("accepts fiat USD create body", () => {
    const r = validateCreateOrderBody({
      amountUsd: "100.00",
      invoiceCurrency: "USD",
      asset: "USDT",
      network: "tron",
      validitySeconds: 900,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.parsed.invoiceDenomination, "fiat");
      assert.equal(r.parsed.invoiceCurrency, "USD");
    }
  });

  it("accepts EUR fiat create body", () => {
    const r = validateCreateOrderBody({
      invoiceAmount: "50",
      invoiceCurrency: "EUR",
      asset: "ETH",
      network: "ethereum",
      validitySeconds: 900,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.parsed.invoiceCurrency, "EUR");
      assert.equal(r.parsed.invoiceDenomination, "fiat");
    }
  });

  it("accepts exact crypto create body", () => {
    const r = validateCreateOrderBody({
      amountCrypto: "0.25",
      invoiceDenomination: "crypto",
      asset: "ETH",
      network: "ethereum",
      validitySeconds: 900,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.parsed.invoiceDenomination, "crypto");
      assert.equal(r.parsed.amountCrypto, "0.25");
    }
  });
});

describe("EUR/USD feed", () => {
  it("medians EURUSDT venues", async () => {
    clearEurUsdPriceCache();
    const fetchImpl = async (url) => {
      const u = String(url);
      if (u.includes("binance")) {
        return { ok: true, status: 200, json: async () => ({ price: "1.08" }) };
      }
      if (u.includes("coingecko")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ tether: { eur: 1 / 1.1 } }),
        };
      }
      if (u.includes("kraken")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: { ZEURZUSD: { c: ["1.09", "1"] } },
            error: [],
          }),
        };
      }
      throw new Error(u);
    };
    const q = await getEurUsdPrice({ fetchImpl, bypassCache: true, minSources: 2 });
    assert.ok(Number(q.rate) > 1);
    assert.match(q.source, /^median:/);
  });
});

describe("volume USD math", () => {
  it("multiplies EUR invoice by EURUSD then quotes", () => {
    const invoiceUsd = multiplyDecimals("100", "1.1");
    assert.equal(invoiceUsd, "110");
    const q = buildLockedQuote({
      invoiceUsd,
      invoiceAmount: "100",
      invoiceCurrency: "EUR",
      invoiceDenomination: "fiat",
      asset: "USDT",
      decimals: 6,
      merchantMode: "pegged_1to1",
      marketRate: "1",
      rateSource: "peg",
      rateFetchedAt: new Date().toISOString(),
      quoteLockSeconds: 900,
    });
    assert.equal(q.payAmount, "110");
    assert.equal(q.invoiceCurrency, "EUR");
    assert.equal(q.invoiceAmountUsd, "110");
  });
});

describe("BTC rate symbol", () => {
  it("fetches BTC median from mocked venues", async () => {
    clearUsdPriceCache();
    const fetchImpl = async (url) => {
      const u = String(url);
      if (u.includes("binance")) {
        return { ok: true, status: 200, json: async () => ({ price: "100000" }) };
      }
      if (u.includes("coingecko")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ bitcoin: { usd: 100200 } }),
        };
      }
      if (u.includes("kraken")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: { XXBTZUSD: { c: ["100100", "1"] } },
            error: [],
          }),
        };
      }
      throw new Error(u);
    };
    const q = await getUsdPrice("BTC", {
      fetchImpl,
      bypassCache: true,
      minSources: 2,
    });
    assert.equal(q.rate, "100100");
  });
});
