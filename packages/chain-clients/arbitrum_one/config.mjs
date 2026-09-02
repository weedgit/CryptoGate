/**
 * Arbitrum One JSON-RPC runtime config.
 * Contract + confirmations from @paymentgate/domain for the requested asset.
 */

import { AssetCode, NetworkId, getAssetNetworkConfig } from "@paymentgate/domain";

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

/**
 * @param {string} [asset]
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
 *   pairEnabled: boolean,
 * }}
 */
export function getArbitrumOneRuntimeConfig(asset = AssetCode.USDT) {
  const raw = (process.env.ARBITRUM_RPC_URL ?? "").trim();
  const rpcUrl = raw.replace(/\/+$/, "");
  const row = getAssetNetworkConfig(asset, NetworkId.ArbitrumOne);
  return {
    rpcUrl,
    apiKey: (process.env.ARBITRUM_API_KEY ?? "").trim(),
    usdtContractAddress: row?.contractAddress ?? "",
    decimals: row?.decimals ?? 6,
    requiredConfirmations: row?.requiredConfirmations ?? 12,
    asset: row?.asset ?? asset,
    network: NetworkId.ArbitrumOne,
    blockLookback: readInt("ARBITRUM_BLOCK_LOOKBACK", 5000),
    configured: rpcUrl.length > 0,
    pairEnabled: Boolean(row),
  };
}
