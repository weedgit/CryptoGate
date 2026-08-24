/**
 * Mode S HD pool state machine (M2-44).
 * Pure helpers for Andrew's DB claim / release. Matching never holds keys or derives.
 *
 * Domain states: FREE → IN_USE → COOLDOWN → FREE
 * @see doc/M2-44-Hd-Pool.md
 */
import {
  HdPoolState,
  OrderStatus,
  type HdPoolState as HdPoolStateType,
  type OrderStatus as OrderStatusType,
} from "@cryptogate/domain";

/** Default cool-down after order finalization (late-pay / anomaly window). */
export const DEFAULT_HD_POOL_COOLDOWN_MS = 30 * 60 * 1000;

/** Order statuses that release an IN_USE slot into COOLDOWN (not FREE). */
export const HD_POOL_RELEASE_STATUSES = [
  OrderStatus.Completed,
  OrderStatus.Expired,
  OrderStatus.Cancelled,
  OrderStatus.Failed,
] as const;

export function isHdPoolState(value: string): value is HdPoolStateType {
  return (Object.values(HdPoolState) as string[]).includes(value);
}

/** Atomic claim may only take FREE rows. */
export function canClaimHdPoolSlot(state: HdPoolStateType): boolean {
  return state === HdPoolState.Free;
}

/** Final order → COOLDOWN (never immediate FREE). */
export function hdPoolStateAfterOrderFinal(
  current: HdPoolStateType,
): HdPoolStateType {
  if (current !== HdPoolState.InUse) {
    throw new Error(
      `hd pool release requires IN_USE, got ${current}`,
    );
  }
  return HdPoolState.Cooldown;
}

/**
 * After cool-down elapsed (and preferably no unmatched inbound pending),
 * COOLDOWN → FREE.
 */
export function hdPoolStateAfterCooldownElapsed(
  current: HdPoolStateType,
): HdPoolStateType {
  if (current !== HdPoolState.Cooldown) {
    throw new Error(
      `hd pool cool-down exit requires COOLDOWN, got ${current}`,
    );
  }
  return HdPoolState.Free;
}

/** Claim transition: FREE → IN_USE. */
export function hdPoolStateAfterClaim(
  current: HdPoolStateType,
): HdPoolStateType {
  if (!canClaimHdPoolSlot(current)) {
    throw new Error(`hd pool claim requires FREE, got ${current}`);
  }
  return HdPoolState.InUse;
}

export function isHdPoolReleaseOrderStatus(
  status: OrderStatusType | string,
): boolean {
  return (HD_POOL_RELEASE_STATUSES as readonly string[]).includes(status);
}

/**
 * Whether cool-down has elapsed given when the slot entered COOLDOWN.
 * @param cooldownStartedAtMs epoch ms when state became COOLDOWN
 * @param nowMs default Date.now()
 * @param cooldownMs default DEFAULT_HD_POOL_COOLDOWN_MS
 */
export function isHdPoolCooldownElapsed(input: {
  cooldownStartedAtMs: number;
  nowMs?: number;
  cooldownMs?: number;
}): boolean {
  const now = input.nowMs ?? Date.now();
  const window = input.cooldownMs ?? DEFAULT_HD_POOL_COOLDOWN_MS;
  if (!Number.isFinite(input.cooldownStartedAtMs) || window < 0) {
    return false;
  }
  return now - input.cooldownStartedAtMs >= window;
}

/**
 * Allowed directed transitions (for migration / API validation).
 * Derive-new creates a row already IN_USE (no FREE→IN_USE on that row).
 */
export const HD_POOL_ALLOWED_TRANSITIONS: ReadonlyArray<
  readonly [HdPoolStateType, HdPoolStateType]
> = [
  [HdPoolState.Free, HdPoolState.InUse],
  [HdPoolState.InUse, HdPoolState.Cooldown],
  [HdPoolState.Cooldown, HdPoolState.Free],
];

export function isAllowedHdPoolTransition(
  from: HdPoolStateType,
  to: HdPoolStateType,
): boolean {
  return HD_POOL_ALLOWED_TRANSITIONS.some(([a, b]) => a === from && b === to);
}
