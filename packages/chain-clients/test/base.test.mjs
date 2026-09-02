import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { USDC_BASE } from "@paymentgate/domain";
import { healthCheck, getBaseConfig, listRecentTransfers } from "../base/index.mjs";

describe("@paymentgate/chain-clients/base", () => {
  it("healthCheck stub without BASE_RPC_URL", async () => {
    const h = await healthCheck();
    assert.equal(h.network, "base");
    assert.equal(h.mode, "stub");
  });

  it("getBaseConfig reads USDC_BASE", () => {
    const cfg = getBaseConfig("USDC");
    assert.equal(cfg.network, "base");
    assert.equal(cfg.tokenContractAddress, USDC_BASE.contractAddress);
    assert.equal(USDC_BASE.enabled, true);
  });

  it("listRecentTransfers empty stub", async () => {
    const r = await listRecentTransfers({ asset: "USDC", watchedAddresses: ["0xabc"] });
    assert.deepEqual(r.transfers, []);
    assert.equal(r.mode, "stub");
  });
});
