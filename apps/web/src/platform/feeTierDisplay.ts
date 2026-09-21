import type { FeeTierBand } from "./api";

export const TIER_ORDER = ["small", "mid", "enterprise"] as const;

export const TIER_TITLE: Record<string, string> = {
  small: "Small Tier",
  mid: "Mid Tier",
  enterprise: "Enterprise Tier",
};

export function formatVolumeBand(tier: FeeTierBand): string {
  const min = Number(tier.volumeMinUsd ?? 0);
  const maxRaw = tier.volumeMaxUsd;
  const max =
    maxRaw === null || maxRaw === undefined || maxRaw === ""
      ? null
      : Number(maxRaw);
  const fmt = (n: number) =>
    n >= 1000
      ? `$${(n / 1000).toLocaleString("en-US", { maximumFractionDigits: 0 })}K`
      : `$${n.toLocaleString("en-US")}`;
  if (max === null || !Number.isFinite(max)) {
    return `${fmt(Number.isFinite(min) ? min : 0)}+ /mo`;
  }
  return `${fmt(Number.isFinite(min) ? min : 0)} – ${fmt(max)} /mo`;
}

/** @deprecated Prefer formatVolumeBand(tier) with live breakpoints. */
export const TIER_VOLUME_BAND: Record<string, string> = {
  small: "0 – $50K /mo",
  mid: "$50K – $500K /mo",
  enterprise: "$500K+ /mo",
};

/** Tier assignment help when tierDescription is empty. */
export const TIER_DEFAULT_FEATURES: Record<string, string[]> = {
  small: [
    "Automatic merchant volume fee for this monthly volume band",
    "Subscription + volume fee on confirmed payment orders",
    "Automatic agent commission from the schedule for this tier",
  ],
  mid: [
    "Automatic merchant volume fee for this monthly volume band",
    "Subscription + volume fee on confirmed payment orders",
    "Automatic agent commission from the schedule for this tier",
  ],
  enterprise: [
    "Automatic merchant volume fee for high monthly volume",
    "Owner may lock a fixed special rate outside the schedule",
    "Automatic agent commission from the schedule for this tier",
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
