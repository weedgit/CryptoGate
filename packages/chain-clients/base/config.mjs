import { AssetCode, NetworkId, getAssetNetworkConfig } from "@cryptogate/domain";

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

/** @param {string} [asset] */
export function getBaseRuntimeConfig(asset = AssetCode.USDC) {
  const raw = (process.env.BASE_RPC_URL ?? "").trim();
  const rpcUrl = raw.replace(/\/+$/, "");
  const row = getAssetNetworkConfig(asset, NetworkId.Base);
  return {
    rpcUrl,
    apiKey: (process.env.BASE_API_KEY ?? "").trim(),
    usdtContractAddress: row?.contractAddress ?? "",
    decimals: row?.decimals ?? 6,
    requiredConfirmations: row?.requiredConfirmations ?? 12,
    asset: row?.asset ?? asset,
    network: NetworkId.Base,
    blockLookback: readInt("BASE_BLOCK_LOOKBACK", 4000),
    configured: rpcUrl.length > 0,
    pairEnabled: Boolean(row),
  };
}
