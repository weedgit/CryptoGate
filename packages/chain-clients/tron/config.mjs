/**
 * Tron / TronGrid runtime config.
 * Contract + confirmations from @cryptogate/domain (USDT_TRON or USDT_TRON_NILE).
 *
 * Two RPCs so testnet env can complete both Nile and Tron mainnet in one window:
 *   TRON_RPC_URL        → network=tron (mainnet TronGrid)
 *   TRON_NILE_RPC_URL   → network=tron_nile
 * Optional TRON_USDT_CONTRACT overrides the Nile registry contract only.
 */

import {
  AssetCode,
  NetworkId,
  getAssetNetworkConfig,
  isTronFamilyNetwork,
  resolveChainEnvironment,
  ChainEnvironment,
} from "@cryptogate/domain";

export const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export const USDT_TRC20_NILE_CONTRACT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
export const DEFAULT_REQUIRED_CONFIRMATIONS = 19;
export const DEFAULT_TRONGRID_BASE = "https://api.trongrid.io";
export const DEFAULT_TRONGRID_NILE_BASE = "https://nile.trongrid.io";

function trimBase(raw) {
  return (raw ?? "").trim().replace(/\/+$/, "");
}

/** True when a TronGrid base URL is Nile, not mainnet. */
export function isNileTronGridBase(url) {
  const u = String(url ?? "").toLowerCase();
  return u.includes("nile.trongrid") || /(^|\/)nile(\.|\/|$)/.test(u);
}

/**
 * Resolve which Tron network id to use for this asset under the active chain env.
 * @param {string} [asset]
 * @param {string} [networkHint]
 */
export function resolveTronNetworkId(asset = AssetCode.USDT, networkHint) {
  if (networkHint && isTronFamilyNetwork(networkHint)) {
    return networkHint;
  }
  if (resolveChainEnvironment() === ChainEnvironment.Testnet) {
    return NetworkId.TronNile;
  }
  return NetworkId.Tron;
}

/**
 * TronGrid base for a concrete network id. Never sends mainnet traffic to Nile.
 * @param {string} network
 */
export function resolveTronRpcBase(network) {
  const primary = trimBase(process.env.TRON_RPC_URL);
  const nileExplicit = trimBase(process.env.TRON_NILE_RPC_URL);

  if (network === NetworkId.TronNile) {
    if (nileExplicit) return nileExplicit;
    if (primary && isNileTronGridBase(primary)) return primary;
    // Mainnet URL is set: keep Nile alive with the public Nile endpoint.
    if (primary) return DEFAULT_TRONGRID_NILE_BASE;
    return "";
  }

  if (primary && !isNileTronGridBase(primary)) return primary;
  return "";
}

function resolveTronApiKey(network) {
  const nileKey = (process.env.TRON_NILE_API_KEY ?? "").trim();
  const mainKey = (process.env.TRON_API_KEY ?? "").trim();
  if (network === NetworkId.TronNile) return nileKey || mainKey;
  return mainKey;
}

/**
 * @param {string} [asset]
 * @param {string} [networkHint]
 */
export function getTronRuntimeConfig(asset = AssetCode.USDT, networkHint) {
  const network = resolveTronNetworkId(asset, networkHint);
  const baseUrl = resolveTronRpcBase(network);
  const row = getAssetNetworkConfig(asset, network);
  const override = (process.env.TRON_USDT_CONTRACT ?? "").trim();
  const contractAddress =
    (network === NetworkId.TronNile && override ? override : "") ||
    row?.contractAddress ||
    (network === NetworkId.TronNile
      ? USDT_TRC20_NILE_CONTRACT
      : USDT_TRC20_CONTRACT);

  return {
    baseUrl,
    apiKey: resolveTronApiKey(network),
    contractAddress,
    decimals: row?.decimals ?? 6,
    requiredConfirmations:
      row?.requiredConfirmations ?? DEFAULT_REQUIRED_CONFIRMATIONS,
    asset: row?.asset ?? asset,
    network,
    configured: baseUrl.length > 0,
    pairEnabled: Boolean(row),
    nativeAsset: row != null && row.contractAddress == null,
    chainEnv: row?.chainEnv ?? resolveChainEnvironment(),
  };
}
