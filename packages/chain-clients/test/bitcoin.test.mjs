import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BTC_BITCOIN } from "@cryptogate/domain";
import { healthCheck, getBitcoinConfig, listRecentTransfers } from "../bitcoin/index.mjs";

describe("@cryptogate/chain-clients/bitcoin", () => {
  it("healthCheck stub without BITCOIN_RPC_URL", async () => {
    const h = await healthCheck();
    assert.equal(h.network, "bitcoin");
    assert.equal(h.mode, "stub");
  });

  it("getBitcoinConfig reads BTC_BITCOIN", () => {
    const cfg = getBitcoinConfig("BTC");
    assert.equal(cfg.asset, "BTC");
    assert.equal(cfg.requiredConfirmations, 3);
    assert.equal(BTC_BITCOIN.enabled, true);
  });

  it("listRecentTransfers empty stub", async () => {
    const r = await listRecentTransfers({
      asset: "BTC",
      watchedAddresses: ["bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"],
    });
    assert.deepEqual(r.transfers, []);
    assert.equal(r.mode, "stub");
  });
});
