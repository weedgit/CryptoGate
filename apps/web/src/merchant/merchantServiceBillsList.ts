import type { ServiceBill } from "./api";
import { listServiceBills } from "./api";
import { createListCache } from "../shared/listCache";

const billsListCache = createListCache<ServiceBill[]>({
  storageKey: "cryptogate.merchant.service-bills",
  fetch: () => listServiceBills(),
});

export function invalidateMerchantServiceBillsList(): void {
  billsListCache.invalidate();
}

export function peekMerchantServiceBills(): ServiceBill[] | null {
  return billsListCache.peek();
}

export async function getMerchantServiceBills(opts?: {
  force?: boolean;
}): Promise<ServiceBill[]> {
  return billsListCache.get(opts);
}
