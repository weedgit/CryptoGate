import { ServiceBillStatus } from "@paymentgate/domain";
import { getPool } from "../db/pool.mjs";

/**
 * Transition issued bills past due_at to overdue (idempotent).
 * @returns {Promise<{ count: number, orgIds: string[] }>}
 */
export async function markOverdueServiceBills(now = new Date()) {
  const { rows } = await getPool().query(
    `UPDATE service_bills
     SET status = $1, updated_at = now()
     WHERE status = $2
       AND due_at < $3::timestamptz
     RETURNING org_id`,
    [ServiceBillStatus.Overdue, ServiceBillStatus.Issued, now.toISOString()],
  );
  const orgIds = [...new Set(rows.map((r) => String(r.org_id)))];
  return { count: rows.length, orgIds };
}
