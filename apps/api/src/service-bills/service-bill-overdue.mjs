import { ServiceBillStatus } from "@cryptogate/domain";
import { getPool } from "../db/pool.mjs";

/**
 * Transition issued bills past due_at to overdue (idempotent).
 * @returns {Promise<number>} rows updated
 */
export async function markOverdueServiceBills(now = new Date()) {
  const { rowCount } = await getPool().query(
    `UPDATE service_bills
     SET status = $1, updated_at = now()
     WHERE status = $2
       AND due_at < $3::timestamptz`,
    [ServiceBillStatus.Overdue, ServiceBillStatus.Issued, now.toISOString()],
  );
  return rowCount ?? 0;
}
