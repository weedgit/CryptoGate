import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requoteExpiresAt, requotePairBlock } from "../src/orders/order-quote-routes.mjs";
import { killSwitchPricingModes } from "../src/rates/pricing-settings-store.mjs";

describe("re-quote payment window", () => {
  const now = new Date("2026-09-30T10:00:00.000Z");
  const quoteExp = "2026-09-30T10:15:00.000Z";

  it("re-opens the requested window, capped by the new quote lock", () => {
    assert.equal(requoteExpiresAt(1800, quoteExp, now).toISOString(), quoteExp);
    assert.equal(
      requoteExpiresAt(300, quoteExp, now).toISOString(),
      "2026-09-30T10:05:00.000Z",
    );
  });

  it("orders created before validity was stored get the quote lock", () => {
    assert.equal(requoteExpiresAt(null, quoteExp, now).toISOString(), quoteExp);
    assert.equal(requoteExpiresAt(undefined, quoteExp, now).toISOString(), quoteExp);
  });
});

describe("re-quote pair rules", () => {
  const fiat = { invoice_denomination: "fiat", asset: "USDT", network: "tron" };
  const crypto = { invoice_denomination: "crypto", asset: "ETH", network: "ethereum" };

  it("fiat invoices may move asset or network", () => {
    assert.equal(requotePairBlock(fiat, "USDT", "ethereum"), null);
    assert.equal(requotePairBlock(fiat, "USDC", "ethereum"), null);
  });

  it("exact-crypto invoices keep their pair", () => {
    assert.equal(requotePairBlock(crypto, "ETH", "ethereum"), null);
    assert.equal(requotePairBlock(crypto, "USDT", "ethereum")?.code, "crypto_invoice_pair_locked");
  });
});

describe("pricing kill switch scope", () => {
  const on = { ratesEnabled: true, modePegged1to1Enabled: true, modeMarketEnabled: true };

  it("rates off ends every rate-priced mode, never crypto_exact", () => {
    const modes = killSwitchPricingModes(on, { ...on, ratesEnabled: false });
    assert.deepEqual([...modes].sort(), ["depeg_market", "market", "pegged_1to1"]);
  });

  it("each mode switch ends only its own orders", () => {
    assert.deepEqual(killSwitchPricingModes(on, { ...on, modePegged1to1Enabled: false }), ["pegged_1to1"]);
    assert.deepEqual(killSwitchPricingModes(on, { ...on, modeMarketEnabled: false }), ["market", "depeg_market"]);
  });

  it("no change, or re-enabling, ends nothing", () => {
    assert.deepEqual(killSwitchPricingModes(on, on), []);
    assert.deepEqual(killSwitchPricingModes({ ...on, ratesEnabled: false }, on), []);
  });
});
