import {
  PLATFORM_FEE_ASSET,
  resolvePlatformFeeNetwork,
} from "@cryptogate/domain";
import { webChainEnvOverride } from "./assetNetworks";

/** Active platform billing / commission remittance network for this web build. */
export function platformFeeNetwork(): string {
  return resolvePlatformFeeNetwork(webChainEnvOverride());
}

export function platformFeeAsset(): string {
  return PLATFORM_FEE_ASSET;
}
