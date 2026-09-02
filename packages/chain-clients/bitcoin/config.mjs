import { AssetCode, NetworkId, getAssetNetworkConfig } from "@paymentgate/domain";

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

export function getBitcoinRuntimeConfig(asset = AssetCode.BTC) {
  const raw = (process.env.BITCOIN_RPC_URL ?? "").trim();
  const baseUrl = raw.replace(/\/+$/, "");
  const row = getAssetNetworkConfig(asset, NetworkId.Bitcoin);
  return {
    baseUrl,
    apiKey: (process.env.BITCOIN_API_KEY ?? "").trim(),
    decimals: row?.decimals ?? 8,
    requiredConfirmations: row?.requiredConfirmations ?? 3,
    asset: row?.asset ?? asset,
    network: NetworkId.Bitcoin,
    txLimit: readInt("BITCOIN_TX_LIMIT", 25),
    configured: baseUrl.length > 0,
    pairEnabled: Boolean(row),
  };
}
