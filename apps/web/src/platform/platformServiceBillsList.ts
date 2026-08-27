import type { ServiceBill } from "./api";
import { listServiceBills, SERVICE_BILLS_LIST_LIMIT } from "./api";

const CACHE_TTL_MS = 30_000;

let cachedBills: ServiceBill[] | null = null;
let cachedAt = 0;
let inflight: Promise<ServiceBill[]> | null = null;

/** Drop cached bill list after issue / void / status change. */
export function invalidatePlatformServiceBillsList(): void {
  cachedBills = null;
  cachedAt = 0;
  inflight = null;
}

/** Synchronous peek — paint cached bills without a loading flash. */
export function peekPlatformServiceBills(): ServiceBill[] | null {
  return cachedBills;
}

function refreshBills(): Promise<ServiceBill[]> {
  if (inflight) return inflight;
  inflight = listServiceBills({ limit: SERVICE_BILLS_LIST_LIMIT })
    .then((bills) => {
      cachedBills = bills;
      cachedAt = Date.now();
      inflight = null;
      return bills;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}

/**
 * Deduped full service-bill list for Agents payout + Bills index.
 * Status-filtered views should still call `listServiceBills` directly.
 */
export async function getPlatformServiceBills(opts?: {
  force?: boolean;
}): Promise<ServiceBill[]> {
  const now = Date.now();
  const fresh = cachedBills && now - cachedAt < CACHE_TTL_MS;

  if (!opts?.force && fresh) {
    return cachedBills!;
  }

  if (!opts?.force && cachedBills) {
    void refreshBills().catch(() => {
      /* keep serving stale on background failure */
    });
    return cachedBills;
  }

  return refreshBills();
}
