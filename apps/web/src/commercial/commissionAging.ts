/** Days since paidAt (UTC calendar days floored). Null if missing/invalid. */
export function commissionPaidAgingDays(
  paidAt: string | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (!paidAt) return null;
  const t = Date.parse(paidAt);
  if (!Number.isFinite(t)) return null;
  return Math.floor((nowMs - t) / (24 * 60 * 60 * 1000));
}

/** Stuck paid awaiting agent confirm (≥ threshold days). */
export function commissionPaidIsAging(
  paidAt: string | null | undefined,
  thresholdDays = 7,
  nowMs = Date.now(),
): boolean {
  const days = commissionPaidAgingDays(paidAt, nowMs);
  return days != null && days >= thresholdDays;
}

export function formatCommissionPaidAgingHint(
  paidAt: string | null | undefined,
  nowMs = Date.now(),
): string | null {
  const days = commissionPaidAgingDays(paidAt, nowMs);
  if (days == null || days < 7) return null;
  return `Paid ${days}d — awaiting agent`;
}
