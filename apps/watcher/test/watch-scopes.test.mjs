import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveWatchScopes } from "../src/config.mjs";

function baseConfig(overrides = {}) {
  return {
    pollIntervalMs: 5000,
    pendingPollIntervalMs: 2000,
    idlePollIntervalMs: 15000,
    addressPollBudget: 64,
    pendingFastTicks: 1,
    defaultAsset: "USDT",
    defaultNetwork: "tron",
    databaseUrl: null,
    multiNetwork: true,
    networkAllowList: null,
    assetAllowList: null,
    scopeTimeoutMs: 60_000,
    confirmConcurrency: 8,
    scopeConcurrency: 4,
    ...overrides,
  };
}

describe("resolveWatchScopes", () => {
  it("single-pair mode uses DEFAULT only", () => {
    const scopes = resolveWatchScopes(baseConfig({ multiNetwork: false }), [
      { asset: "USDT", network: "ethereum" },
    ]);
    assert.deepEqual(scopes, [{ asset: "USDT", network: "tron" }]);
  });

  it("multi mode unions open scopes with DEFAULT fallback", () => {
    const scopes = resolveWatchScopes(baseConfig(), [
      { asset: "USDT", network: "ethereum" },
      { asset: "USDC", network: "solana" },
    ]);
    assert.deepEqual(scopes, [
      { asset: "USDT", network: "ethereum" },
      { asset: "USDC", network: "solana" },
      { asset: "USDT", network: "tron" },
    ]);
  });

  it("respects WATCHER_NETWORKS / WATCHER_ASSETS allow-lists", () => {
    const scopes = resolveWatchScopes(
      baseConfig({
        networkAllowList: ["ethereum", "solana"],
        assetAllowList: ["USDT"],
      }),
      [
        { asset: "USDT", network: "ethereum" },
        { asset: "USDC", network: "solana" },
        { asset: "USDT", network: "tron" },
      ],
    );
    assert.deepEqual(scopes, [{ asset: "USDT", network: "ethereum" }]);
  });
});
