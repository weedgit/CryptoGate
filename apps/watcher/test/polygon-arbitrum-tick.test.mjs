import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { USDT_POLYGON, USDT_ARBITRUM_ONE } from "@cryptogate/domain";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {Record<string, string | undefined>} envOverrides
 */
function runWatcherOnce(envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["./src/main.mjs"], {
      cwd: root,
      env: {
        ...process.env,
        WATCHER_POLL_INTERVAL_MS: "100",
        ...envOverrides,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
    child.on("error", reject);
  });
}

describe("@cryptogate/watcher polygon ingest smoke", () => {
  it("default tron tick reports polygon health stub", async () => {
    const { code, stdout, stderr } = await runWatcherOnce({
      DEFAULT_NETWORK: "tron",
      POLYGON_RPC_URL: undefined,
      ARBITRUM_RPC_URL: undefined,
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
      TRON_RPC_URL: undefined,
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

describe("@cryptogate/watcher arbitrum_one ingest smoke", () => {
  it("arbitrum_one target reports arbitrum-rpc when ARBITRUM_RPC_URL set", async () => {
    const { code, stdout, stderr } = await runWatcherOnce({
      DEFAULT_NETWORK: "arbitrum_one",
      DEFAULT_ASSET: "USDT",
      ARBITRUM_RPC_URL: "https://arb-staging.example/rpc",
      TRON_RPC_URL: undefined,
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
