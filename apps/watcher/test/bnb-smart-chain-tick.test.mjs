import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { USDT_BNB_SMART_CHAIN } from "@cryptogate/domain";
import { runWatcherOnce } from "./run-watcher-once.mjs";

describe("@cryptogate/watcher bnb_smart_chain ingest smoke (X-06)", () => {
  it("default network tron still reports bnb_smart_chain health stub", async () => {
    const { code, stdout, stderr } = await runWatcherOnce({
      DEFAULT_NETWORK: "tron",
    });
    assert.equal(code, 0, stderr);
    const tick = JSON.parse(stdout.trim().split("\n")[1]);
    assert.equal(tick.target.network, "tron");
    assert.equal(tick.chain.bnb_smart_chain.mode, "stub");
    assert.equal(tick.chain.ethereum.mode, "stub");
  });

  it("bnb_smart_chain target reports bsc-rpc when BSC_RPC_URL set", async () => {
    const { code, stdout, stderr } = await runWatcherOnce({
      DEFAULT_NETWORK: "bnb_smart_chain",
      DEFAULT_ASSET: "USDT",
      BSC_RPC_URL: "https://bsc-staging.example/rpc",
    });
    assert.equal(code, 0, stderr);
    const tick = JSON.parse(stdout.trim().split("\n")[1]);
    assert.equal(tick.target.network, "bnb_smart_chain");
    assert.equal(tick.target.asset, "USDT");
    assert.equal(tick.chain.bnb_smart_chain.mode, "bsc-rpc");
    assert.equal(tick.chain.bnb_smart_chain.rpcConfigured, true);
    assert.equal(tick.ingest.mode, "noop");
  });

  it("registry confirmations for BSC are 15 and decimals 18 (live)", () => {
    assert.equal(USDT_BNB_SMART_CHAIN.requiredConfirmations, 15);
    assert.equal(USDT_BNB_SMART_CHAIN.decimals, 18);
    assert.equal(USDT_BNB_SMART_CHAIN.enabled, true);
    assert.equal(USDT_BNB_SMART_CHAIN.network, "bnb_smart_chain");
  });
});
