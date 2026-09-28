import type { PaymentOrder, Session } from "../api";

/** O/A any pending on org; Cashier own pending only. */
export function canCancelPendingOrder(
  session: Session,
  order: PaymentOrder | null,
): boolean {
  if (!order || order.status !== "pending_payment") return false;
  const orgId = order.orgId;
  if (!orgId) return false;
  const m = session.memberships.find((row) => row.orgId === orgId);
  if (!m) return false;
  if (m.role === "cashier") {
    return Boolean(order.createdBy && order.createdBy === session.userId);
  }
  return m.role === "owner" || m.role === "administrator";
}

/** O/A any anomaly on org; Cashier own only. */
export function canResolveAnomalyOrder(
  session: Session,
  order: PaymentOrder | null,
): boolean {
  if (!order || order.status !== "payment_anomaly") return false;
  const orgId = order.orgId;
  if (!orgId) return false;
  const m = session.memberships.find((row) => row.orgId === orgId);
  if (!m) return false;
  if (m.role === "cashier") {
    return Boolean(order.createdBy && order.createdBy === session.userId);
  }
  return m.role === "owner" || m.role === "administrator";
}
