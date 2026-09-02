import type { ServiceBill } from "./api";
import { listServiceBills, SERVICE_BILLS_LIST_LIMIT } from "./api";
import { createListCache } from "../shared/listCache";

const billsListCache = createListCache<ServiceBill[]>({
  storageKey: "paymentgate.platform.service-bills",
  fetch: () => listServiceBills({ limit: SERVICE_BILLS_LIST_LIMIT }),
});

/** Drop cached bill list after issue / void / status change. */
export function invalidatePlatformServiceBillsList(): void {
  billsListCache.invalidate();
}

/** Synchronous peek — paint cached bills without a loading flash. */
export function peekPlatformServiceBills(): ServiceBill[] | null {
  return billsListCache.peek();
}

/**
 * Deduped full service-bill list for Agents payout + Bills index.
 * Status-filtered views should still call `listServiceBills` directly.
 */
export async function getPlatformServiceBills(opts?: {
  force?: boolean;
}): Promise<ServiceBill[]> {
  return billsListCache.get(opts);
}
