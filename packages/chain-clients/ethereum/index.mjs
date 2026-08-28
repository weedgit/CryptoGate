/**
 * Ethereum chain client — ERC-20 + native ETH via JSON-RPC when ETH_RPC_URL is set.
 * Confirmations + contract from @cryptogate/domain per asset.
 * No imports from apps/api.
 */

import { AssetCode } from "@cryptogate/domain";
import { getEthereumRuntimeConfig, ERC20_TRANSFER_TOPIC } from "./config.mjs";
import {
  fetchErc20TransfersForAddresses,
  fetchNativeEthTransfersForAddresses,
  fetchTransactionConfirmationState,
  mapTransferLog,
} from "./rpc.mjs";

export { minorToMajor } from "../tron/amount.mjs";
export { ERC20_TRANSFER_TOPIC } from "./config.mjs";
export { mapTransferLog } from "./rpc.mjs";
export {
  extraWatcherBackoffMs,
  ethBackoffMs,
  isRetryableEthStatus,
  parseRetryAfterMs,
} from "./backoff.mjs";

/** @typedef {{ ok: boolean, network: string, mode: string, rpcConfigured: boolean, asset: string }} EthHealth */

export async function healthCheck() {
  const cfg = getEthereumRuntimeConfig(AssetCode.USDT);
  return {
    ok: true,
    network: "ethereum",
    mode: cfg.configured ? "eth-rpc" : "stub",
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
  const watched = (options.watchedAddresses ?? [])
    .map((a) => a.trim())
    .filter(Boolean);
  const asset = options.asset ?? AssetCode.USDT;

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
                (w) => w.toLowerCase() === String(t.toAddress ?? "").trim().toLowerCase(),
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

  const cfg = getEthereumRuntimeConfig(asset);
  if (!cfg.pairEnabled || !cfg.configured) {
    return {
      transfers: [],
      mode: "stub",
      watchedAddressCount: watched.length,
    };
  }

  if (watched.length === 0) {
    return {
      transfers: [],
      mode: "eth-rpc",
      watchedAddressCount: 0,
    };
  }

  try {
    const live = cfg.nativeAsset
      ? await fetchNativeEthTransfersForAddresses({
          watchedAddresses: watched,
          fetchImpl: options.fetch,
          sleepImpl: options.sleep,
          runtimeConfig: cfg,
          pollMode: "eth-rpc",
        })
      : await fetchErc20TransfersForAddresses({
          watchedAddresses: watched,
          fetchImpl: options.fetch,
          sleepImpl: options.sleep,
          runtimeConfig: cfg,
          pollMode: "eth-rpc",
        });
    return {
      transfers: dedupeTransfersByTxHash(live.transfers),
      mode: live.mode,
      watchedAddressCount: live.watchedAddressCount,
    };
  } catch (err) {
    return {
      transfers: [],
      mode: "eth-rpc-error",
      watchedAddressCount: watched.length,
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

  const cfg = getEthereumRuntimeConfig(args?.asset ?? AssetCode.USDT);
  if (!cfg.configured || !args?.txHash) {
    return { confirmations: 0, presence: "unknown" };
  }

  return fetchTransactionConfirmationState({
    txHash: args.txHash,
    fetchImpl: args.fetch,
    runtimeConfig: cfg,
  });
}

export async function getTransactionConfirmations(args) {
  const state = await getTransactionConfirmationState(args);
  return state.confirmations;
}

export function getEthereumConfig(asset = AssetCode.USDT) {
  const cfg = getEthereumRuntimeConfig(asset);
  return {
    network: cfg.network,
    asset: cfg.asset,
    tokenContractAddress: cfg.usdtContractAddress,
    rpcUrl: cfg.configured ? cfg.rpcUrl : null,
    apiKeyConfigured: cfg.apiKey.length > 0,
    requiredConfirmations: cfg.requiredConfirmations,
    decimals: cfg.decimals,
    blockLookback: cfg.blockLookback,
    pairEnabled: cfg.pairEnabled,
    nativeAsset: cfg.nativeAsset,
  };
}
