import type { FeeTierBand } from "./api";

export const TIER_ORDER = ["small", "mid", "enterprise"] as const;

export const TIER_TITLE: Record<string, string> = {
  small: "Small Tier",
  mid: "Mid Tier",
  enterprise: "Enterprise Tier",
};

export const TIER_VOLUME_BAND: Record<string, string> = {
  small: "0 – $50K /mo",
  mid: "$50K – $500K /mo",
  enterprise: "$500K+ /mo",
};

/** Tier assignment help when tierDescription is empty (B8 — pricing profile only, not feature gates). */
export const TIER_DEFAULT_FEATURES: Record<string, string[]> = {
  small: [
    "Typical profile: single-location merchant, low monthly volume",
    "USD 49/mo subscription + volume fee on confirmed payment orders",
    "Agent assigns rate within 1.2% – 2.0% band (default 2% at signup)",
  ],
  mid: [
    "Typical profile: multi-location parent merchant or steady high volume",
    "USD 199/mo subscription + volume fee on confirmed payment orders",
    "Agent assigns rate within 0.8% – 1.5% band",
  ],
  enterprise: [
    "Typical profile: large group — custom contract terms",
    "Custom subscription and volume fee; Owner approval for out-of-band rates",
    "Agent rate within 0.5% – 1.0% unless Owner approves otherwise",
  ],
};

export function formatTierPercent(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return `${n.toFixed(2).replace(/\.?0+$/, "")}%`;
}

export function formatTierSubscription(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function tierFeatures(tier: FeeTierBand): string[] {
  const fromDesc = tier.tierDescription
    ?.split(/\n|•/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromDesc && fromDesc.length > 0) return fromDesc;
  return TIER_DEFAULT_FEATURES[tier.tier] ?? [];
}

export function nextBillingPeriodLabel(from = new Date()): string {
  const next = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1),
  );
  return next.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function tiersSnapshot(tiers: FeeTierBand[]): string {
  return JSON.stringify(
    [...tiers].sort(
      (a, b) =>
        TIER_ORDER.indexOf(a.tier as (typeof TIER_ORDER)[number]) -
        TIER_ORDER.indexOf(b.tier as (typeof TIER_ORDER)[number]),
    ),
  );
}
