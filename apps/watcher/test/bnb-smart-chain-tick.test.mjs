import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { USDT_BNB_SMART_CHAIN } from "@cryptogate/domain";

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

describe("@cryptogate/watcher bnb_smart_chain ingest smoke (X-06)", () => {
  it("default network tron still reports bnb_smart_chain health stub", async () => {
    const { code, stdout, stderr } = await runWatcherOnce({
      DEFAULT_NETWORK: "tron",
      ETH_RPC_URL: undefined,
      BSC_RPC_URL: undefined,
      TRON_RPC_URL: undefined,
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
      ETH_RPC_URL: undefined,
      TRON_RPC_URL: undefined,
    });
    assert.equal(code, 0, stderr);
    const tick = JSON.parse(stdout.trim().split("\n")[1]);
    assert.equal(tick.target.network, "bnb_smart_chain");
    assert.equal(tick.target.asset, "USDT");
    assert.equal(tick.chain.bnb_smart_chain.mode, "bsc-rpc");
    assert.equal(tick.chain.bnb_smart_chain.rpcConfigured, true);
    assert.equal(tick.ingest.mode, "noop");
  });

  it("registry confirmations for BSC are 15 and decimals 18 (enabled false)", () => {
    assert.equal(USDT_BNB_SMART_CHAIN.requiredConfirmations, 15);
    assert.equal(USDT_BNB_SMART_CHAIN.decimals, 18);
    assert.equal(USDT_BNB_SMART_CHAIN.enabled, false);
    assert.equal(USDT_BNB_SMART_CHAIN.network, "bnb_smart_chain");
  });
});
