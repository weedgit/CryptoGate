import type { MatchCandidateOrder } from "./types.js";

export function parseCreatedAtMs(createdAt?: string): number | null {
  if (!createdAt?.trim()) return null;
  const ms = Date.parse(createdAt.trim());
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Inbound tx may bind only when it occurred at or after order create.
 * Missing transfer or createdAt timestamps skip the check (stub / legacy paths).
 */
export function isTransferEligibleForOrder(
  transferAtMs: number | undefined,
  createdAt?: string,
): boolean {
  if (
    transferAtMs === undefined ||
    transferAtMs === null ||
    !Number.isFinite(transferAtMs)
  ) {
    return true;
  }
  const createdMs = parseCreatedAtMs(createdAt);
  if (createdMs === null) return true;
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
