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

export type BillingScheduleInput = {
  billingAnchorAt?: string | null;
  nextInvoiceOn?: string | null;
  waivedMonthsLeft?: number | null;
  activationWaived?: boolean;
};

export function waivedMonthsLabel(months: number): string {
  return months === 1 ? "1 waived month left" : `${months} waived months left`;
}

/**
 * Read-only schedule parts after activation, e.g.
 * ["Activated 2026-09-01", "Next bill 2026-10-01", "2 waived months left"].
 * Empty when the merchant is not activated yet.
 */
export function billingScheduleParts(c: BillingScheduleInput): string[] {
  if (!c.billingAnchorAt) return [];
  const parts = [`Activated ${String(c.billingAnchorAt).slice(0, 10)}`];
  if (c.nextInvoiceOn) parts.push(`Next bill ${c.nextInvoiceOn}`);
  if (c.waivedMonthsLeft && c.waivedMonthsLeft > 0) {
    parts.push(waivedMonthsLabel(c.waivedMonthsLeft));
  }
  return parts;
}

/** One-line schedule; before activation shows the activation fee or its waiver. */
export function billingScheduleSummary(
  c: BillingScheduleInput,
  activationFeeUsd?: string | null,
): string {
  const parts = billingScheduleParts(c);
  if (parts.length > 0) return parts.join(" · ");
  const pending = ["Not activated"];
  if (c.activationWaived) pending.push("Activation waived");
  else if (activationFeeUsd) pending.push(`Activation $${activationFeeUsd}`);
  if (c.waivedMonthsLeft && c.waivedMonthsLeft > 0) {
    pending.push(waivedMonthsLabel(c.waivedMonthsLeft));
  }
  return pending.join(" · ");
}

/** Schedule band for settled volume this billing month. */
export function tierForMonthlyVolume(
  volumeUsd: number,
  tiers: ReadonlyArray<{ tier: string; volumeMinUsd?: string; volumeMaxUsd?: string | null }>,
): string | null {
  if (tiers.length === 0) return null;
  const vol = Number.isFinite(volumeUsd) ? volumeUsd : 0;
  const rank: Record<string, number> = { enterprise: 3, mid: 2, small: 1 };
  const match = tiers
    .map((row) => ({
      tier: row.tier,
      min: Number(row.volumeMinUsd ?? 0),
      max:
        row.volumeMaxUsd == null || row.volumeMaxUsd === ""
          ? null
          : Number(row.volumeMaxUsd),
    }))
    .filter((band) => {
      if (!Number.isFinite(band.min) || vol < band.min) return false;
      if (band.max != null && Number.isFinite(band.max) && vol >= band.max) return false;
      return true;
    })
    .sort((a, b) => (rank[b.tier] ?? 0) - (rank[a.tier] ?? 0))[0];
  return match?.tier ?? "small";
}
