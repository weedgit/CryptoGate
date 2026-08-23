import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { healthCheck, getTronConfig, listRecentTransfers } from "../tron/index.mjs";

describe("@cryptogate/chain-clients/tron stub", () => {
  it("healthCheck returns stub mode", async () => {
    const h = await healthCheck();
    assert.equal(h.network, "tron");
    assert.equal(h.mode, "stub");
    assert.equal(h.ok, true);
  });

  it("getTronConfig includes USDT contract placeholder", () => {
    const cfg = getTronConfig();
    assert.equal(cfg.network, "tron");
    assert.equal(cfg.asset, "USDT");
    assert.ok(cfg.usdtContractAddress.startsWith("T"));
  });

  it("listRecentTransfers returns empty in stub", async () => {
    const { transfers } = await listRecentTransfers({});
    assert.deepEqual(transfers, []);
  });
});
