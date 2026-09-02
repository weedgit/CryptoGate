/**
 * BNB Smart Chain client — USDT BEP-20 via JSON-RPC when BSC_RPC_URL is set (X-06).
 * Confirmations + contract + decimals from @paymentgate/domain USDT_BNB_SMART_CHAIN.
 * Reuses EVM log polling from ethereum/rpc (parameterized runtime config).
 * Registry pair USDT/bnb_smart_chain is enabled — live when BSC_RPC_URL is set.
 * No imports from apps/api.
 */

import { getBnbSmartChainRuntimeConfig } from "./config.mjs";
import {
  fetchErc20TransfersForAddresses,
  fetchTransactionConfirmationState,
  mapTransferLog,
} from "../ethereum/rpc.mjs";
import { ERC20_TRANSFER_TOPIC } from "../ethereum/config.mjs";

export { minorToMajor } from "../tron/amount.mjs";
export { mapTransferLog, ERC20_TRANSFER_TOPIC };
export {
  extraWatcherBackoffMs,
  bscBackoffMs,
  isRetryableBscStatus,
} from "./backoff.mjs";

/** @typedef {{ ok: boolean, network: string, mode: string, rpcConfigured: boolean, asset: string }} BscHealth */

/**
 * @returns {Promise<BscHealth>}
 */
export async function healthCheck() {
  const cfg = getBnbSmartChainRuntimeConfig();
  return {
    ok: true,
    network: "bnb_smart_chain",
    mode: cfg.configured ? "bsc-rpc" : "stub",
    rpcConfigured: cfg.configured,
    asset: cfg.asset,
  };
}

/**
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
 * Poll recent USDT BEP-20 transfers to watched addresses.
 * Precedence: WATCHER_STUB_TRANSFERS → JSON-RPC (BSC_RPC_URL) → empty stub.
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
              watched.some(
                (w) =>
                  w.toLowerCase() ===
                  String(t.toAddress ?? "").trim().toLowerCase(),
              ),
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

  const cfg = getBnbSmartChainRuntimeConfig();
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
      mode: "bsc-rpc",
      watchedAddressCount: 0,
    };
  }

  try {
    const live = await fetchErc20TransfersForAddresses({
      watchedAddresses: watched,
      fetchImpl: options.fetch,
      sleepImpl: options.sleep,
      runtimeConfig: cfg,
      pollMode: "bsc-rpc",
    });
    return {
      transfers: dedupeTransfersByTxHash(live.transfers),
      mode: live.mode,
      watchedAddressCount: live.watchedAddressCount,
    };
  } catch (err) {
    return {
      transfers: [],
      mode: "bsc-rpc-error",
      watchedAddressCount: watched.length,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {{ txHash: string, network?: string, fetch?: typeof fetch }} args
 * @returns {Promise<{ confirmations: number, presence: 'confirmed' | 'missing' | 'unknown' }>}
 */
export async function getTransactionConfirmationState(args) {
  const stubPresence = process.env.WATCHER_STUB_TX_PRESENCE?.trim();
  const stub = process.env.WATCHER_STUB_CONFIRMATIONS;
  if (stub !== undefined && stub !== "") {
    const n = Number.parseInt(stub, 10);
    if (!Number.isNaN(n) && n >= 0) {
      const presence =
        stubPresence === "missing" || stubPresence === "unknown"
          ? stubPresence
          : "confirmed";
      return { confirmations: n, presence };
    }
  }
  if (stubPresence === "missing" || stubPresence === "unknown") {
    return { confirmations: 0, presence: stubPresence };
  }

  const cfg = getBnbSmartChainRuntimeConfig();
  if (!cfg.configured || !args?.txHash) {
    return { confirmations: 0, presence: "unknown" };
  }

  return fetchTransactionConfirmationState({
    txHash: args.txHash,
    fetchImpl: args.fetch,
    runtimeConfig: cfg,
  });
}

/**
 * @param {{ txHash: string, network?: string, fetch?: typeof fetch }} args
 * @returns {Promise<number>}
 */
export async function getTransactionConfirmations(args) {
  const state = await getTransactionConfirmationState(args);
  return state.confirmations;
}

export function getBnbSmartChainConfig() {
  const cfg = getBnbSmartChainRuntimeConfig();
  return {
    network: cfg.network,
    asset: cfg.asset,
    usdtContractAddress: cfg.usdtContractAddress,
    rpcUrl: cfg.configured ? cfg.rpcUrl : null,
    apiKeyConfigured: cfg.apiKey.length > 0,
    requiredConfirmations: cfg.requiredConfirmations,
    decimals: cfg.decimals,
    blockLookback: cfg.blockLookback,
  };
}
