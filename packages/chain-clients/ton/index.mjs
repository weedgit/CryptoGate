import { AssetCode } from "@cryptogate/domain";
import { getTonRuntimeConfig } from "./config.mjs";
import {
  fetchJettonTransfersForAddresses,
  fetchTransactionConfirmationState,
  mapJettonTransferEvent,
} from "./api.mjs";

export { minorToMajor } from "../tron/amount.mjs";
export { mapJettonTransferEvent };
export { extraWatcherBackoffMs, isRetryableTonStatus } from "./backoff.mjs";

export async function healthCheck() {
  const cfg = getTonRuntimeConfig(AssetCode.USDT);
  return {
    ok: true,
    network: "ton",
    mode: cfg.configured ? "ton-api" : "stub",
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

  const cfg = getTonRuntimeConfig(asset);
  if (!cfg.pairEnabled || !cfg.configured) {
    return { transfers: [], mode: "stub", watchedAddressCount: watched.length };
  }
  if (watched.length === 0) {
    return { transfers: [], mode: "ton-api", watchedAddressCount: 0 };
  }

  try {
    const live = await fetchJettonTransfersForAddresses({
      watchedAddresses: watched,
      fetchImpl: options.fetch,
      runtimeConfig: cfg,
      pollMode: "ton-api",
    });
    return {
      transfers: dedupeTransfersByTxHash(live.transfers),
      mode: live.mode,
      watchedAddressCount: live.watchedAddressCount,
    };
  } catch (err) {
    return {
      transfers: [],
      mode: "ton-api-error",
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

  const cfg = getTonRuntimeConfig(args?.asset ?? AssetCode.USDT);
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

export function getTonConfig(asset = AssetCode.USDT) {
  const cfg = getTonRuntimeConfig(asset);
  return {
    network: cfg.network,
    asset: cfg.asset,
    jettonMaster: cfg.jettonMaster,
    apiBase: cfg.configured ? cfg.baseUrl : null,
    apiKeyConfigured: cfg.apiKey.length > 0,
    requiredConfirmations: cfg.requiredConfirmations,
    decimals: cfg.decimals,
    pairEnabled: cfg.pairEnabled,
  };
}
