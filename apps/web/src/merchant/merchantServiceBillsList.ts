import type { ServiceBill } from "./api";
import { listServiceBills, SERVICE_BILLS_LIST_LIMIT } from "./api";
import { createListCache } from "../shared/listCache";

const billsListCache = createListCache<ServiceBill[]>({
  storageKey: "paymentgate.merchant.service-bills",
  fetch: () => listServiceBills({ limit: SERVICE_BILLS_LIST_LIMIT }),
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
