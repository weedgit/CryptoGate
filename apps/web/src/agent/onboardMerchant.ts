import type { Session } from "./api";

/** Phase 1 tier/volume fields — UI-only until X-01 fee tier API. */
export type MerchantTier = "small" | "mid" | "enterprise";

export type OnboardMerchantCommercialStub = {
  tier: MerchantTier;
  volumeFeePercent: string;
};

export const MERCHANT_TIER_LABELS: Record<MerchantTier, string> = {
  small: "Small",
  mid: "Mid",
  enterprise: "Enterprise",
};

export type MerchantStructure = "single_location" | "multi_location";

export const STRUCTURE_LABELS: Record<MerchantStructure, string> = {
  single_location: "Single location",
  multi_location: "Multi-location",
};
