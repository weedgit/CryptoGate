import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { USDT_ETHEREUM } from "@paymentgate/domain";
import { runWatcherOnce } from "./run-watcher-once.mjs";

describe("@paymentgate/watcher ethereum ingest smoke (M3-32)", () => {
  it("default network tron still reports ethereum health stub", async () => {
    const { code, stdout, stderr } = await runWatcherOnce({
      DEFAULT_NETWORK: "tron",
    });
    assert.equal(code, 0, stderr);
    const tick = JSON.parse(stdout.trim().split("\n")[1]);
    assert.equal(tick.target.network, "tron");
    assert.equal(tick.chain.ethereum.mode, "stub");
    assert.equal(tick.chain.bnb_smart_chain.mode, "stub");
    assert.equal(tick.chain.tron.mode, "stub");
  });

  it("ethereum target reports eth-rpc when ETH_RPC_URL set", async () => {
    const { code, stdout, stderr } = await runWatcherOnce({
      DEFAULT_NETWORK: "ethereum",
      DEFAULT_ASSET: "USDT",
      ETH_RPC_URL: "https://eth-staging.example/rpc",
    });
    assert.equal(code, 0, stderr);
    const tick = JSON.parse(stdout.trim().split("\n")[1]);
    assert.equal(tick.target.network, "ethereum");
    assert.equal(tick.target.asset, "USDT");
    assert.equal(tick.chain.ethereum.mode, "eth-rpc");
    assert.equal(tick.chain.ethereum.rpcConfigured, true);
    assert.equal(tick.ingest.mode, "noop");
  });

  it("registry confirmations for ethereum are 12 (not hardcoded 19)", () => {
    assert.equal(USDT_ETHEREUM.requiredConfirmations, 12);
    assert.equal(USDT_ETHEREUM.enabled, true);
    assert.equal(USDT_ETHEREUM.network, "ethereum");
  });
});
