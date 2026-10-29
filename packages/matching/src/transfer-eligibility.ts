import type { MatchCandidateOrder } from "./types.js";

export function parseCreatedAtMs(createdAt?: string): number | null {
  if (!createdAt?.trim()) return null;
  const ms = Date.parse(createdAt.trim());
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Inbound tx may bind only when it occurred at or after order create.
 * An undated transfer is ineligible for a dated order: it could predate it (review H3).
 * Orders without createdAt (legacy rows) skip the check.
 */
export function isTransferEligibleForOrder(
  transferAtMs: number | undefined,
  createdAt?: string,
): boolean {
  const createdMs = parseCreatedAtMs(createdAt);
  if (createdMs === null) return true;
  if (
    transferAtMs === undefined ||
    transferAtMs === null ||
    !Number.isFinite(transferAtMs)
  ) {
    return false;
  }
  return transferAtMs >= createdMs;
}

export function filterEligibleCandidates<T extends Pick<MatchCandidateOrder, "createdAt">>(
  candidates: readonly T[],
  transferAtMs: number | undefined,
): T[] {
  return candidates.filter((order) =>
    isTransferEligibleForOrder(transferAtMs, order.createdAt),
  );
}
