/**
 * BNB Smart Chain JSON-RPC runtime config (X-06).
 * Contract + confirmations + decimals from @paymentgate/domain USDT_BNB_SMART_CHAIN.
 */

import { USDT_BNB_SMART_CHAIN } from "@paymentgate/domain";

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

/**
 * @returns {{
 *   rpcUrl: string,
 *   apiKey: string,
 *   usdtContractAddress: string,
 *   decimals: number,
 *   requiredConfirmations: number,
 *   asset: string,
 *   network: string,
 *   blockLookback: number,
 *   configured: boolean,
 * }}
 */
export function getBnbSmartChainRuntimeConfig() {
  const raw = (process.env.BSC_RPC_URL ?? "").trim();
  const rpcUrl = raw.replace(/\/+$/, "");
  return {
    rpcUrl,
    apiKey: (process.env.BSC_API_KEY ?? "").trim(),
    usdtContractAddress: USDT_BNB_SMART_CHAIN.contractAddress,
    decimals: USDT_BNB_SMART_CHAIN.decimals,
    requiredConfirmations: USDT_BNB_SMART_CHAIN.requiredConfirmations,
    asset: USDT_BNB_SMART_CHAIN.asset,
    network: USDT_BNB_SMART_CHAIN.network,
    blockLookback: readInt("BSC_BLOCK_LOOKBACK", 2000),
    configured: rpcUrl.length > 0,
  };
}
