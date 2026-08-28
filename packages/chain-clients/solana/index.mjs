import { AssetCode } from "@cryptogate/domain";
import { getSolanaRuntimeConfig } from "./config.mjs";
import {
  fetchSplTransfersForAddresses,
  fetchTransactionConfirmationState,
  mapSplTransferFromTransaction,
} from "./rpc.mjs";

export { minorToMajor } from "../tron/amount.mjs";
export { mapSplTransferFromTransaction };
export { extraWatcherBackoffMs, solanaBackoffMs, isRetryableSolanaStatus } from "./backoff.mjs";

export async function healthCheck() {
  const cfg = getSolanaRuntimeConfig(AssetCode.USDT);
  return {
    ok: true,
    network: "solana",
    mode: cfg.configured ? "solana-rpc" : "stub",
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
  const asset = options.asset ?? AssetCode.USDT;
  const stubRaw = process.env.WATCHER_STUB_TRANSFERS;
  if (stubRaw) {
    try {
      const parsed = JSON.parse(stubRaw);
      const list = Array.isArray(parsed) ? parsed : [];
      const filtered =
        watched.length === 0
          ? list
          : list.filter((t) => watched.includes(String(t.toAddress ?? "").trim()));
      return {
        transfers: dedupeTransfersByTxHash(filtered),
        mode: "stub-env",
        watchedAddressCount: watched.length,
      };
    } catch {
      return { transfers: [], mode: "stub-env-invalid-json", watchedAddressCount: watched.length };
    }
  }

  const cfg = getSolanaRuntimeConfig(asset);
  if (!cfg.pairEnabled || !cfg.configured) {
    return { transfers: [], mode: "stub", watchedAddressCount: watched.length };
  }
  if (watched.length === 0) {
    return { transfers: [], mode: "solana-rpc", watchedAddressCount: 0 };
  }

  try {
    const live = await fetchSplTransfersForAddresses({
      watchedAddresses: watched,
      fetchImpl: options.fetch,
      runtimeConfig: cfg,
      pollMode: "solana-rpc",
    });
    return {
      transfers: dedupeTransfersByTxHash(live.transfers),
      mode: live.mode,
      watchedAddressCount: live.watchedAddressCount,
    };
  } catch (err) {
    return {
      transfers: [],
      mode: "solana-rpc-error",
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

  const cfg = getSolanaRuntimeConfig(args?.asset ?? AssetCode.USDT);
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
  return (await getTransactionConfirmationState(args)).confirmations;
}

export function getSolanaConfig(asset = AssetCode.USDT) {
  const cfg = getSolanaRuntimeConfig(asset);
  return {
    network: cfg.network,
    asset: cfg.asset,
    mintAddress: cfg.mintAddress,
    rpcUrl: cfg.configured ? cfg.rpcUrl : null,
    apiKeyConfigured: cfg.apiKey.length > 0,
    requiredConfirmations: cfg.requiredConfirmations,
    decimals: cfg.decimals,
    pairEnabled: cfg.pairEnabled,
  };
}
