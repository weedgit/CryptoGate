import type { PaymentOrder } from "../api";

export function orderTime(o: PaymentOrder): string {
  return o.createdAt || o.expiresAt;
}

export function formatUsd(n: number): string {
  const amount = n.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
  return `${amount} USD`;
}
