import type { PaymentDetails } from "./api";
import { getPaymentDetails } from "./api";
import { createEntityCache } from "../shared/entityCache";

const paymentDetailCache = createEntityCache<PaymentDetails>({
  storageKeyPrefix: "paymentgate.merchant.order-payment",
  memoryTtlMs: 10_000,
  persistTtlMs: 2 * 60_000,
  fetch: getPaymentDetails,
});

export function peekMerchantOrderPayment(orderId: string): PaymentDetails | null {
  return paymentDetailCache.peek(orderId);
}

export async function getMerchantOrderPayment(
  orderId: string,
  opts?: { force?: boolean },
): Promise<PaymentDetails> {
  return paymentDetailCache.get(orderId, opts);
}

export function primeMerchantOrderPayment(
  orderId: string,
  payment: PaymentDetails,
): void {
  paymentDetailCache.prime(orderId, payment);
}

export function invalidateMerchantOrderPayment(orderId: string): void {
  paymentDetailCache.invalidate(orderId);
}
