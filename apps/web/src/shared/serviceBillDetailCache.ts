import type { ServiceBill } from "../merchant/api";
import { getServiceBill } from "../merchant/api";
import { createEntityCache } from "./entityCache";
import { findCachedPageItem } from "./serverListApi";

const billDetailCache = createEntityCache<ServiceBill>({
  storageKeyPrefix: "paymentgate.service-bill",
  fetch: getServiceBill,
});

export function peekServiceBillInLists(billId: string): ServiceBill | null {
  return findCachedPageItem<ServiceBill>("/service-bills", billId);
}

export function peekServiceBill(billId: string): ServiceBill | null {
  return billDetailCache.peek(billId) ?? peekServiceBillInLists(billId);
}

export async function getCachedServiceBill(
  billId: string,
  opts?: { force?: boolean },
): Promise<ServiceBill> {
  return billDetailCache.get(billId, opts);
}

export function primeServiceBill(billId: string, bill: ServiceBill): void {
  billDetailCache.prime(billId, bill);
}

export function invalidateServiceBill(billId: string): void {
  billDetailCache.invalidate(billId);
}
