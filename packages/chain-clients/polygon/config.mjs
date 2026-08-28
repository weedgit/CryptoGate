/**
 * Polygon PoS JSON-RPC runtime config.
 * Contract + confirmations from @cryptogate/domain for the requested asset.
 */

import { AssetCode, NetworkId, getAssetNetworkConfig } from "@cryptogate/domain";

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
export function getPolygonRuntimeConfig(asset = AssetCode.USDT) {
  const raw = (process.env.POLYGON_RPC_URL ?? "").trim();
  const rpcUrl = raw.replace(/\/+$/, "");
  const row = getAssetNetworkConfig(asset, NetworkId.Polygon);
  return {
    rpcUrl,
    apiKey: (process.env.POLYGON_API_KEY ?? "").trim(),
    usdtContractAddress: row?.contractAddress ?? "",
    decimals: row?.decimals ?? 6,
    requiredConfirmations: row?.requiredConfirmations ?? 64,
    asset: row?.asset ?? asset,
    network: NetworkId.Polygon,
    blockLookback: readInt("POLYGON_BLOCK_LOOKBACK", 4000),
    configured: rpcUrl.length > 0,
    pairEnabled: Boolean(row),
  };
}
