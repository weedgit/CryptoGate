/**
 * Tron chain client stub (M1). M3: live RPC ingest for USDT TRC-20.
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
 * Placeholder for M3 block / TRC-20 transfer polling.
 * Each transfer: { toAddress, amount, asset?, network?, txHash, memoOrTag? }
 * @returns {Promise<{ transfers: Array<{ toAddress: string, amount: string, txHash: string, asset?: string, network?: string, memoOrTag?: string }> }>}
 */
export async function listRecentTransfers(_options) {
  return { transfers: [] };
}

export function getTronConfig() {
  return {
    network: "tron",
    asset: "USDT",
    /** TRC-20 USDT mainnet contract (confirm in network catalog before prod). */
    usdtContractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    rpcUrl: process.env.TRON_RPC_URL ?? null,
    requiredConfirmations: 19,
  };
}
