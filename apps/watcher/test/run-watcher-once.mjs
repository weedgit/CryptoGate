/**
 * Shared spawn helper for watcher smoke tests.
 * Clears developer `.env` pollution so unit ticks stay hermetic (no DB / live RPC).
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Env keys that must not leak from a developer shell into watcher unit tests. */
export const WATCHER_TEST_CLEAR_KEYS = [
  "DATABASE_URL",
  "TRON_RPC_URL",
  "TRON_NILE_RPC_URL",
  "TRON_API_KEY",
  "TRON_NILE_API_KEY",
  "TRON_USDT_CONTRACT",
  "ETH_RPC_URL",
  "BSC_RPC_URL",
  "POLYGON_RPC_URL",
  "ARBITRUM_RPC_URL",
  "BASE_RPC_URL",
  "SOLANA_RPC_URL",
  "TON_RPC_URL",
  "TON_API_URL",
  "BITCOIN_RPC_URL",
  "WATCHER_MULTI_NETWORK",
  "WATCHER_NETWORKS",
  "WATCHER_ASSETS",
  "PAYMENTGATE_CHAIN_ENV",
  "VITE_PAYMENTGATE_CHAIN_ENV",
  "WATCHER_STUB_TRANSFERS",
  "WATCHER_STUB_CONFIRMATIONS",
  "WATCHER_STUB_TX_PRESENCE",
  "DEFAULT_NETWORK",
  "DEFAULT_ASSET",
];

/**
 * @param {Record<string, string | undefined>} envOverrides
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>}
 */
export function runWatcherOnce(envOverrides = {}) {
  return new Promise((resolve, reject) => {
    /** @type {NodeJS.ProcessEnv} */
    const env = {
      ...process.env,
      WATCHER_POLL_INTERVAL_MS: "100",
    };
    for (const key of WATCHER_TEST_CLEAR_KEYS) {
      delete env[key];
    }
    for (const [key, value] of Object.entries(envOverrides)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }

    const child = spawn("node", ["./src/main.mjs"], {
      cwd: root,
      env,
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
