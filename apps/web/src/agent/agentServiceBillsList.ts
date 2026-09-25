import type { ServiceBill } from "./api";
import { listServiceBills, SERVICE_BILLS_LIST_LIMIT } from "./api";
import { createListCache } from "../shared/listCache";

const billsListCache = createListCache<ServiceBill[]>({
  storageKey: "paymentgate.agent.service-bills",
  fetch: () => listServiceBills({ limit: SERVICE_BILLS_LIST_LIMIT }),
});

export function invalidateAgentServiceBillsList(): void {
  billsListCache.invalidate();
}

export function peekAgentServiceBills(): ServiceBill[] | null {
  return billsListCache.peek();
}

export async function getAgentServiceBills(opts?: {
  force?: boolean;
}): Promise<ServiceBill[]> {
  return billsListCache.get(opts);
}
