import { OrderStatus } from "@cryptogate/domain";
import { getPool } from "../db/pool.mjs";

/**
 * Only Pending Payment past expires_at becomes Expired.
 * Verifying / confirmed stay open for late-payment anomaly handling (watcher).
 * @param {{ status: string, expires_at: Date | string }} row
 * @param {number} [nowMs]
 */
export function isExpirablePending(row, nowMs = Date.now()) {
  if (row.status !== OrderStatus.PendingPayment) return false;
  const expiresAt = new Date(row.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= nowMs;
}

/**
 * Idempotent: already-expired rows are not selected.
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 * @returns {Promise<string[]>} expired order ids
 */
export async function expireDuePaymentOrders(client) {
  const db = client ?? getPool();
  const { rows } = await db.query(
    `UPDATE payment_orders
     SET status = $1, updated_at = now()
     WHERE status = $2
       AND expires_at <= now()
     RETURNING id`,
    [OrderStatus.Expired, OrderStatus.PendingPayment],
  );
  return rows.map((row) => row.id);
}
