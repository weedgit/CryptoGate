import type { PaymentOrder } from "./api";
import { getOrder } from "./api";
import { createEntityCache } from "../shared/entityCache";
import { peekMerchantOrders } from "./merchantOrdersList";

const orderDetailCache = createEntityCache<PaymentOrder>({
  storageKeyPrefix: "paymentgate.merchant.order",
  fetch: getOrder,
});

export function peekMerchantOrderInList(orderId: string): PaymentOrder | null {
  return peekMerchantOrders()?.find((o) => o.id === orderId) ?? null;
}

export function peekMerchantOrder(orderId: string): PaymentOrder | null {
  return orderDetailCache.peek(orderId) ?? peekMerchantOrderInList(orderId);
}

export async function getMerchantOrder(
  orderId: string,
  opts?: { force?: boolean },
): Promise<PaymentOrder> {
  return orderDetailCache.get(orderId, opts);
}

export function primeMerchantOrder(orderId: string, order: PaymentOrder): void {
  orderDetailCache.prime(orderId, order);
}

export function invalidateMerchantOrder(orderId: string): void {
  orderDetailCache.invalidate(orderId);
}
