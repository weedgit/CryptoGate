export type MerchantTier = "small" | "mid" | "enterprise";

export const MERCHANT_TIER_LABELS: Record<MerchantTier, string> = {
  small: "Small",
  mid: "Mid",
  enterprise: "Enterprise",
};

export function tierLabel(tier: string): string {
  if (tier in MERCHANT_TIER_LABELS) {
    return MERCHANT_TIER_LABELS[tier as MerchantTier];
  }
  return tier;
}
