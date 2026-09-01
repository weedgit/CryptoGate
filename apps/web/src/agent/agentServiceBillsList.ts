import type { ServiceBill } from "./api";
import { listServiceBills } from "./api";
import { createListCache } from "../shared/listCache";

const billsListCache = createListCache<ServiceBill[]>({
  storageKey: "cryptogate.agent.service-bills",
  fetch: () => listServiceBills(),
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
