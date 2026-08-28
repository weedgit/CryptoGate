/**
 * Ethereum JSON-RPC runtime config.
 * Contract + confirmations from @cryptogate/domain for the requested asset.
 */

import { AssetCode, NetworkId, getAssetNetworkConfig } from "@cryptogate/domain";

/** keccak256("Transfer(address,address,uint256)") */
export const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

/** @param {string} [asset] */
export function getEthereumRuntimeConfig(asset = AssetCode.USDT) {
  const raw = (process.env.ETH_RPC_URL ?? "").trim();
  const rpcUrl = raw.replace(/\/+$/, "");
  const row = getAssetNetworkConfig(asset, NetworkId.Ethereum);
  return {
    rpcUrl,
    apiKey: (process.env.ETH_API_KEY ?? "").trim(),
    usdtContractAddress: row?.contractAddress ?? "",
    decimals: row?.decimals ?? 18,
    requiredConfirmations: row?.requiredConfirmations ?? 12,
    asset: row?.asset ?? asset,
    network: NetworkId.Ethereum,
    blockLookback: readInt("ETH_BLOCK_LOOKBACK", 2000),
    configured: rpcUrl.length > 0,
    pairEnabled: Boolean(row),
    nativeAsset: row != null && row.contractAddress == null,
  };
}
