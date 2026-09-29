/** Open order that holds the same payable amount (Mode B) — from `409 mode_b_amount_in_use`. */
export type BlockingOrderInfo = {
  id: string;
  orderNumber: string;
  status: string;
  payableAmount: string;
  asset: string;
  network: string;
  createdAt?: string | null;
  createdByEmail?: string | null;
  createdByLabel: string;
};

export function parseBlockingOrder(details: unknown): BlockingOrderInfo | null {
  if (!details || typeof details !== "object") return null;
  const blocking = (details as { blockingOrder?: Record<string, unknown> })
    .blockingOrder;
  if (!blocking || typeof blocking !== "object") return null;
  const id = typeof blocking.id === "string" ? blocking.id : "";
  const orderNumber =
    typeof blocking.orderNumber === "string" ? blocking.orderNumber : "";
  if (!id || !orderNumber) return null;
  return {
    id,
    orderNumber,
    status: typeof blocking.status === "string" ? blocking.status : "pending_payment",
    payableAmount:
      typeof blocking.payableAmount === "string" ? blocking.payableAmount : "",
    asset: typeof blocking.asset === "string" ? blocking.asset : "",
    network: typeof blocking.network === "string" ? blocking.network : "",
    createdAt:
      typeof blocking.createdAt === "string" ? blocking.createdAt : null,
    createdByEmail:
      typeof blocking.createdByEmail === "string"
        ? blocking.createdByEmail
        : null,
    createdByLabel:
      typeof blocking.createdByLabel === "string"
        ? blocking.createdByLabel
        : typeof blocking.createdByEmail === "string"
          ? blocking.createdByEmail
          : "another cashier",
  };
}
