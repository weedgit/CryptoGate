import { AssetCode, NetworkId, getAssetNetworkConfig } from "@cryptogate/domain";

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

/** @param {string} [asset] */
export function getTonRuntimeConfig(asset = AssetCode.USDT) {
  const raw = (process.env.TON_RPC_URL ?? "").trim();
  const baseUrl = raw.replace(/\/+$/, "");
  const row = getAssetNetworkConfig(asset, NetworkId.Ton);
  return {
    baseUrl,
    apiKey: (process.env.TON_API_KEY ?? "").trim(),
    jettonMaster: row?.contractAddress ?? "",
    decimals: row?.decimals ?? 6,
    requiredConfirmations: row?.requiredConfirmations ?? 5,
    asset: row?.asset ?? asset,
    network: NetworkId.Ton,
    eventLimit: readInt("TON_EVENT_LIMIT", 30),
    configured: baseUrl.length > 0,
    pairEnabled: Boolean(row),
  };
}
