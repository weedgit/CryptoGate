import type { ServiceBill } from "../merchant/api";
import { getServiceBill } from "../merchant/api";
import { peekAgentServiceBills } from "../agent/agentServiceBillsList";
import { createEntityCache } from "./entityCache";
import { peekMerchantServiceBills } from "../merchant/merchantServiceBillsList";
import { peekPlatformServiceBills } from "../platform/platformServiceBillsList";

const billDetailCache = createEntityCache<ServiceBill>({
  storageKeyPrefix: "cryptogate.service-bill",
  fetch: getServiceBill,
});

export function peekServiceBillInLists(billId: string): ServiceBill | null {
  return (
    peekMerchantServiceBills()?.find((b) => b.id === billId) ??
    peekAgentServiceBills()?.find((b) => b.id === billId) ??
    peekPlatformServiceBills()?.find((b) => b.id === billId) ??
    null
  );
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
