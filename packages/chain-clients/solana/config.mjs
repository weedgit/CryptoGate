import { AssetCode, NetworkId, getAssetNetworkConfig } from "@cryptogate/domain";

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

/** @param {string} [asset] */
export function getSolanaRuntimeConfig(asset = AssetCode.USDT) {
  const raw = (process.env.SOLANA_RPC_URL ?? "").trim();
  const rpcUrl = raw.replace(/\/+$/, "");
  const row = getAssetNetworkConfig(asset, NetworkId.Solana);
  return {
    rpcUrl,
    apiKey: (process.env.SOLANA_API_KEY ?? "").trim(),
    mintAddress: row?.contractAddress ?? "",
    decimals: row?.decimals ?? 6,
    requiredConfirmations: row?.requiredConfirmations ?? 32,
    asset: row?.asset ?? asset,
    network: NetworkId.Solana,
    signatureLimit: readInt("SOLANA_SIGNATURE_LIMIT", 40),
    configured: rpcUrl.length > 0,
    pairEnabled: Boolean(row),
  };
}
