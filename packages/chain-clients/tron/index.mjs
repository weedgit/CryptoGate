/**
 * Tron chain client (M3-40 ingest stub). Live RPC when TRON_RPC_URL is set later.
 * No imports from apps/api.
 */

/** @typedef {{ ok: boolean; network: string; mode: string; rpcConfigured: boolean; asset: string }} TronHealth */

/**
 * @returns {Promise<TronHealth>}
 */
export async function healthCheck() {
  const rpcUrl = process.env.TRON_RPC_URL ?? "";
  return {
    ok: true,
    network: "tron",
    mode: "stub",
    rpcConfigured: rpcUrl.length > 0,
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
 * Stub returns [] until TRON_RPC_URL + live client (M3-40).
 * Optional WATCHER_STUB_TRANSFERS JSON array for local smoke tests.
 *
 * @param {{
 *   asset?: string,
 *   network?: string,
 *   watchedAddresses?: string[],
 * }} [options]
 * @returns {Promise<{
 *   transfers: Array<{ toAddress: string, amount: string, txHash: string, asset?: string, network?: string, memoOrTag?: string }>,
 *   mode: string,
 *   watchedAddressCount: number,
 * }>}
 */
export async function listRecentTransfers(options = {}) {
  const watched = (options.watchedAddresses ?? [])
    .map((a) => a.trim())
    .filter(Boolean);
  const rpcUrl = process.env.TRON_RPC_URL ?? "";

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

  if (!rpcUrl) {
    return {
      transfers: [],
      mode: "stub",
      watchedAddressCount: watched.length,
    };
  }

  // Live TronGrid / JSON-RPC ingest lands here (M3-40 follow-up).
  return {
    transfers: [],
    mode: "rpc-not-implemented",
    watchedAddressCount: watched.length,
  };
}

/**
 * Confirmation count for a tx (M3-42). Stub returns 0 until live RPC.
 * Set WATCHER_STUB_CONFIRMATIONS to simulate enough confirms in local tests.
 * @param {{ txHash: string, network?: string }} _args
 * @returns {Promise<number>}
 */
export async function getTransactionConfirmations(_args) {
  const stub = process.env.WATCHER_STUB_CONFIRMATIONS;
  if (stub !== undefined && stub !== "") {
    const n = Number.parseInt(stub, 10);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return 0;
}

export function getTronConfig() {
  return {
    network: "tron",
    asset: "USDT",
    usdtContractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    rpcUrl: process.env.TRON_RPC_URL ?? null,
    requiredConfirmations: 19,
  };
}
