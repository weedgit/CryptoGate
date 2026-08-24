/**
 * Tron chain client — USDT TRC-20 via TronGrid when TRON_RPC_URL is set (M3-30).
 * No imports from apps/api.
 */

import { getTronRuntimeConfig } from "./config.mjs";
import {
  fetchTransactionConfirmations,
  fetchTrc20TransfersForAddresses,
} from "./trongrid.mjs";

export { minorToMajor } from "./amount.mjs";
export { mapTrc20Row } from "./trongrid.mjs";
export {
  extraWatcherBackoffMs,
  isRetryableTronStatus,
  parseRetryAfterMs,
  tronBackoffMs,
} from "./backoff.mjs";
export {
  USDT_TRC20_CONTRACT,
  DEFAULT_REQUIRED_CONFIRMATIONS,
  DEFAULT_TRONGRID_BASE,
} from "./config.mjs";

/** @typedef {{ ok: boolean; network: string; mode: string; rpcConfigured: boolean; asset: string }} TronHealth */

/**
 * @returns {Promise<TronHealth>}
 */
export async function healthCheck() {
  const cfg = getTronRuntimeConfig();
  return {
    ok: true,
    network: "tron",
    mode: cfg.configured ? "trongrid" : "stub",
    rpcConfigured: cfg.configured,
    asset: "USDT",
  };
}

/**
 * Dedupe inbound transfers by network+txHash (M3-40).
 * @param {Array<{ txHash: string, network?: string }>} transfers
 */
export function dedupeTransfersByTxHash(transfers) {
  const seen = new Set();
  const out = [];
  for (const t of transfers) {
    const key = `${t.network ?? ""}:${t.txHash}`;
    if (!t.txHash || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Poll recent USDT transfers to watched addresses.
 * Precedence: WATCHER_STUB_TRANSFERS → TronGrid (TRON_RPC_URL) → empty stub.
 *
 * @param {{
 *   asset?: string,
 *   network?: string,
 *   watchedAddresses?: string[],
 *   fetch?: typeof fetch,
 *   sleep?: (ms: number) => Promise<void>,
 * }} [options]
 */
export async function listRecentTransfers(options = {}) {
  const watched = (options.watchedAddresses ?? [])
    .map((a) => a.trim())
    .filter(Boolean);

  const stubRaw = process.env.WATCHER_STUB_TRANSFERS;
  if (stubRaw) {
    try {
      const parsed = JSON.parse(stubRaw);
      const list = Array.isArray(parsed) ? parsed : [];
      const filtered =
        watched.length === 0
          ? list
          : list.filter((t) =>
              watched.some((w) => w === String(t.toAddress ?? "").trim()),
            );
      return {
        transfers: dedupeTransfersByTxHash(filtered),
        mode: "stub-env",
        watchedAddressCount: watched.length,
      };
    } catch {
      return {
        transfers: [],
        mode: "stub-env-invalid-json",
        watchedAddressCount: watched.length,
      };
    }
  }

  const cfg = getTronRuntimeConfig();
  if (!cfg.configured) {
    return {
      transfers: [],
      mode: "stub",
      watchedAddressCount: watched.length,
    };
  }

  if (watched.length === 0) {
    return {
      transfers: [],
      mode: "trongrid",
      watchedAddressCount: 0,
    };
  }

  try {
    const live = await fetchTrc20TransfersForAddresses({
      watchedAddresses: watched,
      fetchImpl: options.fetch,
      sleepImpl: options.sleep,
    });
    return {
      transfers: dedupeTransfersByTxHash(live.transfers),
      mode: live.mode,
      watchedAddressCount: live.watchedAddressCount,
    };
  } catch (err) {
    return {
      transfers: [],
      mode: "trongrid-error",
      watchedAddressCount: watched.length,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Confirmation count for a tx (M3-42 / M3-30).
 * Precedence: WATCHER_STUB_CONFIRMATIONS → TronGrid → 0.
 * @param {{ txHash: string, network?: string, fetch?: typeof fetch }} args
 * @returns {Promise<number>}
 */
export async function getTransactionConfirmations(args) {
  const stub = process.env.WATCHER_STUB_CONFIRMATIONS;
  if (stub !== undefined && stub !== "") {
    const n = Number.parseInt(stub, 10);
    if (!Number.isNaN(n) && n >= 0) return n;
  }

  const cfg = getTronRuntimeConfig();
  if (!cfg.configured || !args?.txHash) return 0;

  try {
    return await fetchTransactionConfirmations({
      txHash: args.txHash,
      fetchImpl: args.fetch,
    });
  } catch {
    return 0;
  }
}

export function getTronConfig() {
  const cfg = getTronRuntimeConfig();
  return {
    network: "tron",
    asset: "USDT",
    usdtContractAddress: cfg.usdtContractAddress,
    rpcUrl: cfg.configured ? cfg.baseUrl : null,
    apiKeyConfigured: cfg.apiKey.length > 0,
    requiredConfirmations: cfg.requiredConfirmations,
    decimals: cfg.decimals,
  };
}
