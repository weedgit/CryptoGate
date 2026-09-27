import type { PaymentOrder } from "./api";
import { listOrders } from "./api";

/** Cap for dashboard rate/KPI samples — high enough to cover Metrics pairs. */
const DASHBOARD_ORDERS_LIMIT = 500;
/** Match API MAX_UNBOUNDED_SPAN_MS — platform-wide list requires a bounded period. */
const MAX_PLATFORM_ORDERS_SPAN_MS = 31 * 24 * 60 * 60 * 1000;
const MEMORY_TTL_MS = 20_000;

type CacheEntry = { at: number; data: PaymentOrder[] };

let lastKey: string | null = null;
const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<PaymentOrder[]>>();

function rangeKey(createdFrom: string, createdTo: string): string {
  return `${createdFrom}|${createdTo}`;
}

/**
 * Clamp start so the window is ≤ 31 days (platform-wide history guard).
 * Longer dashboard periods still use SQL summary for volume.
 */
export function clampPlatformOrdersRange(
  createdFrom: string,
  createdTo: string,
): { createdFrom: string; createdTo: string } {
  const toMs = Date.parse(createdTo);
  const fromMs = Date.parse(createdFrom);
  if (!Number.isFinite(toMs) || !Number.isFinite(fromMs)) {
    return { createdFrom, createdTo };
  }
  if (toMs - fromMs <= MAX_PLATFORM_ORDERS_SPAN_MS) {
    return { createdFrom, createdTo };
  }
  return {
    createdFrom: new Date(toMs - MAX_PLATFORM_ORDERS_SPAN_MS).toISOString(),
    createdTo,
  };
}

export function invalidatePlatformOrdersList(): void {
  lastKey = null;
  memory.clear();
  inflight.clear();
}

export function peekPlatformOrders(): PaymentOrder[] | null {
  if (!lastKey) return null;
  return memory.get(lastKey)?.data ?? null;
}

export async function getPlatformOrders(opts: {
  createdFrom: string;
  createdTo: string;
  force?: boolean;
}): Promise<PaymentOrder[]> {
  const range = clampPlatformOrdersRange(opts.createdFrom, opts.createdTo);
  const key = rangeKey(range.createdFrom, range.createdTo);
  lastKey = key;

  const hit = memory.get(key);
  if (!opts.force && hit && Date.now() - hit.at < MEMORY_TTL_MS) {
    return hit.data;
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = listOrders({
    limit: DASHBOARD_ORDERS_LIMIT,
    createdFrom: range.createdFrom,
    createdTo: range.createdTo,
  })
    .then((data) => {
      memory.set(key, { at: Date.now(), data });
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, request);
  return request;
}
