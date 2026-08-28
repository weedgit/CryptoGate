import { AssetCode } from "@cryptogate/domain";
import { getBaseRuntimeConfig } from "./config.mjs";
import {
  fetchErc20TransfersForAddresses,
  fetchTransactionConfirmationState,
  mapTransferLog,
} from "../ethereum/rpc.mjs";
import { ERC20_TRANSFER_TOPIC } from "../ethereum/config.mjs";

export { minorToMajor } from "../tron/amount.mjs";
export { mapTransferLog, ERC20_TRANSFER_TOPIC };
export { extraWatcherBackoffMs, baseBackoffMs, isRetryableBaseStatus } from "./backoff.mjs";

export async function healthCheck() {
  const cfg = getBaseRuntimeConfig(AssetCode.USDC);
  return {
    ok: true,
    network: "base",
    mode: cfg.configured ? "base-rpc" : "stub",
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
  const watched = (options.watchedAddresses ?? []).map((a) => a.trim()).filter(Boolean);
  const asset = options.asset ?? AssetCode.USDC;
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
                  w.toLowerCase() === String(t.toAddress ?? "").trim().toLowerCase(),
              ),
            );
      return {
        transfers: dedupeTransfersByTxHash(filtered),
        mode: "stub-env",
        watchedAddressCount: watched.length,
      };
    } catch {
      return { transfers: [], mode: "stub-env-invalid-json", watchedAddressCount: watched.length };
    }
  }

  const cfg = getBaseRuntimeConfig(asset);
  if (!cfg.pairEnabled || !cfg.configured) {
    return { transfers: [], mode: "stub", watchedAddressCount: watched.length };
  }
  if (watched.length === 0) {
    return { transfers: [], mode: "base-rpc", watchedAddressCount: 0 };
  }

  try {
    const live = await fetchErc20TransfersForAddresses({
      watchedAddresses: watched,
      fetchImpl: options.fetch,
      sleepImpl: options.sleep,
      runtimeConfig: cfg,
      pollMode: "base-rpc",
    });
    return {
      transfers: dedupeTransfersByTxHash(live.transfers),
      mode: live.mode,
      watchedAddressCount: live.watchedAddressCount,
    };
  } catch (err) {
    return {
      transfers: [],
      mode: "base-rpc-error",
      watchedAddressCount: watched.length,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getTransactionConfirmationState(args) {
  const stub = process.env.WATCHER_STUB_CONFIRMATIONS;
  const stubPresence = process.env.WATCHER_STUB_TX_PRESENCE?.trim();
  if (stub !== undefined && stub !== "") {
    const n = Number.parseInt(stub, 10);
    if (!Number.isNaN(n) && n >= 0) {
      const presence =
        stubPresence === "missing" || stubPresence === "unknown" ? stubPresence : "confirmed";
      return { confirmations: n, presence };
    }
  }
  if (stubPresence === "missing" || stubPresence === "unknown") {
    return { confirmations: 0, presence: stubPresence };
  }

  const cfg = getBaseRuntimeConfig(args?.asset ?? AssetCode.USDC);
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

export function getBaseConfig(asset = AssetCode.USDC) {
  const cfg = getBaseRuntimeConfig(asset);
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
  };
}
