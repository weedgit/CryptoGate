/**
 * Tron chain client — TRC-20 + native TRX via TronGrid when TRON_RPC_URL is set.
 * No imports from apps/api.
 */

import { AssetCode } from "@cryptogate/domain";
import { filterLikelyTronAddresses } from "./address.mjs";
import { getTronRuntimeConfig } from "./config.mjs";
import {
  fetchNativeTrxTransfersForAddresses,
  fetchTransactionConfirmationState,
  fetchTrc20TransfersForAddresses,
} from "./trongrid.mjs";

export { isLikelyTronAddress, filterLikelyTronAddresses } from "./address.mjs";
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
  USDT_TRC20_NILE_CONTRACT,
  DEFAULT_REQUIRED_CONFIRMATIONS,
  DEFAULT_TRONGRID_BASE,
  DEFAULT_TRONGRID_NILE_BASE,
} from "./config.mjs";

/** @typedef {{ ok: boolean; network: string; mode: string; rpcConfigured: boolean; asset: string }} TronHealth */

export async function healthCheck() {
  const cfg = getTronRuntimeConfig(AssetCode.USDT);
  return {
    ok: true,
    network: cfg.network,
    mode: cfg.configured ? "trongrid" : "stub",
    rpcConfigured: cfg.configured,
    asset: cfg.asset,
  };
}

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

export async function listRecentTransfers(options = {}) {
  const rawWatched = (options.watchedAddresses ?? [])
    .map((a) => a.trim())
    .filter(Boolean);
  const { valid: watched, skipped: skippedInvalid } =
    filterLikelyTronAddresses(rawWatched);
  const asset = options.asset ?? AssetCode.USDT;
  const networkHint = options.network;

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
        skippedInvalidAddresses: skippedInvalid,
      };
    } catch {
      return {
        transfers: [],
        mode: "stub-env-invalid-json",
        watchedAddressCount: watched.length,
        skippedInvalidAddresses: skippedInvalid,
      };
    }
  }

  const cfg = getTronRuntimeConfig(asset, networkHint);
  if (!cfg.pairEnabled || !cfg.configured) {
    return {
      transfers: [],
      mode: "stub",
      watchedAddressCount: watched.length,
      skippedInvalidAddresses: skippedInvalid,
    };
  }

  if (watched.length === 0) {
    return {
      transfers: [],
      mode: "trongrid",
      watchedAddressCount: 0,
      skippedInvalidAddresses: skippedInvalid,
    };
  }

  try {
    const live = cfg.nativeAsset
      ? await fetchNativeTrxTransfersForAddresses({
          watchedAddresses: watched,
          fetchImpl: options.fetch,
          sleepImpl: options.sleep,
          runtimeConfig: cfg,
        })
      : await fetchTrc20TransfersForAddresses({
          watchedAddresses: watched,
          fetchImpl: options.fetch,
          sleepImpl: options.sleep,
          runtimeConfig: cfg,
        });
    return {
      transfers: dedupeTransfersByTxHash(live.transfers),
      mode: live.mode,
      watchedAddressCount: live.watchedAddressCount,
      skippedInvalidAddresses: skippedInvalid,
    };
  } catch (err) {
    return {
      transfers: [],
      mode: "trongrid-error",
      watchedAddressCount: watched.length,
      skippedInvalidAddresses: skippedInvalid,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

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

  const cfg = getTronRuntimeConfig(args?.asset ?? AssetCode.USDT, args?.network);
  if (!cfg.configured || !args?.txHash) {
    return { confirmations: 0, presence: "unknown" };
  }

  return fetchTransactionConfirmationState({
    txHash: args.txHash,
    fetchImpl: args.fetch,
  });
}

export async function getTransactionConfirmations(args) {
  const state = await getTransactionConfirmationState(args);
  return state.confirmations;
}

export function getTronConfig(asset = AssetCode.USDT, networkHint) {
  const cfg = getTronRuntimeConfig(asset, networkHint);
  return {
    network: cfg.network,
    asset: cfg.asset,
    contractAddress: cfg.contractAddress,
    rpcUrl: cfg.configured ? cfg.baseUrl : null,
    apiKeyConfigured: cfg.apiKey.length > 0,
    requiredConfirmations: cfg.requiredConfirmations,
    decimals: cfg.decimals,
    pairEnabled: cfg.pairEnabled,
    nativeAsset: cfg.nativeAsset,
    chainEnv: cfg.chainEnv,
  };
}
