/**
 * Tron / TronGrid runtime config.
 * Contract + confirmations from @cryptogate/domain (USDT_TRON or USDT_TRON_NILE).
 * Optional TRON_USDT_CONTRACT overrides the registry contract (local Nile tweaks).
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
 * @param {string} [asset]
 * @param {string} [networkHint]
 */
export function getTronRuntimeConfig(asset = AssetCode.USDT, networkHint) {
  const network = resolveTronNetworkId(asset, networkHint);
  const raw = (process.env.TRON_RPC_URL ?? "").trim();
  const baseUrl = raw.replace(/\/+$/, "");
  const row = getAssetNetworkConfig(asset, network);
  const override = (process.env.TRON_USDT_CONTRACT ?? "").trim();
  const contractAddress =
    override ||
    row?.contractAddress ||
    (network === NetworkId.TronNile
      ? USDT_TRC20_NILE_CONTRACT
      : USDT_TRC20_CONTRACT);

  return {
    baseUrl,
    apiKey: (process.env.TRON_API_KEY ?? "").trim(),
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
