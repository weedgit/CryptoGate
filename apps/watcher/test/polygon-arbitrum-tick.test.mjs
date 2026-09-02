import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { USDT_POLYGON, USDT_ARBITRUM_ONE } from "@paymentgate/domain";
import { runWatcherOnce } from "./run-watcher-once.mjs";

describe("@paymentgate/watcher polygon ingest smoke", () => {
  it("default tron tick reports polygon health stub", async () => {
    const { code, stdout, stderr } = await runWatcherOnce({
      DEFAULT_NETWORK: "tron",
    });
    assert.equal(code, 0, stderr);
    const tick = JSON.parse(stdout.trim().split("\n")[1]);
    assert.equal(tick.chain.polygon.mode, "stub");
    assert.equal(tick.chain.arbitrum_one.mode, "stub");
  });

  it("polygon target reports polygon-rpc when POLYGON_RPC_URL set", async () => {
    const { code, stdout, stderr } = await runWatcherOnce({
      DEFAULT_NETWORK: "polygon",
      DEFAULT_ASSET: "USDT",
      POLYGON_RPC_URL: "https://polygon-staging.example/rpc",
    });
    assert.equal(code, 0, stderr);
    const tick = JSON.parse(stdout.trim().split("\n")[1]);
    assert.equal(tick.target.network, "polygon");
    assert.equal(tick.target.asset, "USDT");
    assert.equal(tick.chain.polygon.mode, "polygon-rpc");
    assert.equal(tick.chain.polygon.rpcConfigured, true);
  });

  it("registry confirmations for polygon USDT are 64", () => {
    assert.equal(USDT_POLYGON.requiredConfirmations, 64);
    assert.equal(USDT_POLYGON.enabled, true);
    assert.equal(USDT_POLYGON.network, "polygon");
  });
});

describe("@paymentgate/watcher arbitrum_one ingest smoke", () => {
  it("arbitrum_one target reports arbitrum-rpc when ARBITRUM_RPC_URL set", async () => {
    const { code, stdout, stderr } = await runWatcherOnce({
      DEFAULT_NETWORK: "arbitrum_one",
      DEFAULT_ASSET: "USDT",
      ARBITRUM_RPC_URL: "https://arb-staging.example/rpc",
    });
    assert.equal(code, 0, stderr);
    const tick = JSON.parse(stdout.trim().split("\n")[1]);
    assert.equal(tick.target.network, "arbitrum_one");
    assert.equal(tick.chain.arbitrum_one.mode, "arbitrum-rpc");
    assert.equal(tick.chain.arbitrum_one.rpcConfigured, true);
  });

  it("registry confirmations for arbitrum USDT are 12", () => {
    assert.equal(USDT_ARBITRUM_ONE.requiredConfirmations, 12);
    assert.equal(USDT_ARBITRUM_ONE.enabled, true);
    assert.equal(USDT_ARBITRUM_ONE.network, "arbitrum_one");
  });
});
