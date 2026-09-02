import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { USDT_TON } from "@paymentgate/domain";
import { healthCheck, getTonConfig, listRecentTransfers } from "../ton/index.mjs";

describe("@paymentgate/chain-clients/ton", () => {
  it("healthCheck stub without TON_RPC_URL", async () => {
    const h = await healthCheck();
    assert.equal(h.network, "ton");
    assert.equal(h.mode, "stub");
  });

  it("getTonConfig reads USDT_TON jetton master", () => {
    const cfg = getTonConfig("USDT");
    assert.equal(cfg.jettonMaster, USDT_TON.contractAddress);
    assert.equal(USDT_TON.enabled, true);
  });

  it("listRecentTransfers empty stub without API URL", async () => {
    const r = await listRecentTransfers({ asset: "USDT", watchedAddresses: [] });
    assert.deepEqual(r.transfers, []);
    assert.equal(r.mode, "stub");
  });
});
