import type { PaymentOrder } from "./api";
import { listOrders } from "./api";
import { createListCache } from "../shared/listCache";

const DASHBOARD_ORDERS_LIMIT = 200;

const ordersListCache = createListCache<PaymentOrder[]>({
  storageKey: "paymentgate.merchant.orders.200",
  memoryTtlMs: 20_000,
  persistTtlMs: 10 * 60_000,
  fetch: () => listOrders({ limit: DASHBOARD_ORDERS_LIMIT }),
});

export function invalidateMerchantOrdersList(): void {
  ordersListCache.invalidate();
}

export function peekMerchantOrders(): PaymentOrder[] | null {
  return ordersListCache.peek();
}

export async function getMerchantOrders(opts?: {
  force?: boolean;
}): Promise<PaymentOrder[]> {
  return ordersListCache.get(opts);
}
