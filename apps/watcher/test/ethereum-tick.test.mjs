import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { USDT_ETHEREUM } from "@cryptogate/domain";

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

describe("@cryptogate/watcher ethereum ingest smoke (M3-32)", () => {
  it("default network tron still reports ethereum health stub", async () => {
    const { code, stdout, stderr } = await runWatcherOnce({
      DEFAULT_NETWORK: "tron",
      ETH_RPC_URL: undefined,
      TRON_RPC_URL: undefined,
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
      TRON_RPC_URL: undefined,
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
