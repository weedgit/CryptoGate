import { getPool } from "../db/pool.mjs";

const BILL_SELECT = `
  id, org_id, period_start, period_end, subscription_amount, volume_fee_amount,
  total_amount, currency, status, due_at, paid_at, voided_at,
  last_adjustment_reason, payment_reference, created_at, updated_at
`;

/**
 * @param {string} id
 */
export async function findServiceBillById(id) {
  const { rows } = await getPool().query(
    `SELECT ${BILL_SELECT} FROM service_bills WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * @param {{
 *   kind: "all" | "filter",
 *   orgIds?: string[],
 *   orgId?: string | null,
 *   status?: string | null,
 *   limit?: number,
 * }} query
 */
export async function listServiceBills(query) {
  const params = [];
  /** @type {string[]} */
  const where = [];

  if (query.kind === "filter") {
    if (!query.orgIds || query.orgIds.length === 0) return [];
    params.push(query.orgIds);
    where.push(`org_id = ANY($${params.length}::uuid[])`);
  }
  if (query.orgId) {
    params.push(query.orgId);
    where.push(`org_id = $${params.length}::uuid`);
  }
  if (query.status) {
    params.push(query.status);
    where.push(`status = $${params.length}`);
  }

  const limit = query.limit ?? 100;
  params.push(limit);
  const { rows } = await getPool().query(
    `SELECT ${BILL_SELECT}
     FROM service_bills
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY due_at DESC, created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows;
}

/**
 * @param {{
 *   orgId: string,
 *   periodStart: string,
 *   periodEnd: string,
 *   subscriptionAmount: string,
 *   volumeFeeAmount: string,
 *   totalAmount: string,
 *   dueAt: string,
 *   status: string,
 * }} input
 */
export async function insertServiceBill(input) {
  const { rows } = await getPool().query(
    `INSERT INTO service_bills (
       org_id, period_start, period_end, subscription_amount, volume_fee_amount,
       total_amount, currency, status, due_at
     ) VALUES ($1, $2::date, $3::date, $4, $5, $6, 'USD', $7, $8::timestamptz)
     RETURNING ${BILL_SELECT}`,
    [
      input.orgId,
      input.periodStart,
      input.periodEnd,
      input.subscriptionAmount,
      input.volumeFeeAmount,
      input.totalAmount,
      input.status,
      input.dueAt,
    ],
  );
  return rows[0];
}

/**
 * @param {string} id
 * @param {string | null} paymentReference
 */
export async function markServiceBillPaid(id, paymentReference) {
  const { rows } = await getPool().query(
    `UPDATE service_bills
     SET status = 'paid', paid_at = now(), payment_reference = $2, updated_at = now()
     WHERE id = $1 AND status IN ('issued', 'overdue')
     RETURNING ${BILL_SELECT}`,
    [id, paymentReference],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} id
 * @param {string} reason
 */
export async function voidServiceBill(id, _reason) {
  const { rows } = await getPool().query(
    `UPDATE service_bills
     SET status = 'voided', voided_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'issued'
     RETURNING ${BILL_SELECT}`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} id
 * @param {string} totalAmount
 * @param {string} reason
 */
export async function adjustServiceBill(id, totalAmount, reason) {
  const { rows } = await getPool().query(
    `UPDATE service_bills
     SET total_amount = $2, last_adjustment_reason = $3, updated_at = now()
     WHERE id = $1 AND status IN ('issued', 'overdue')
     RETURNING ${BILL_SELECT}`,
    [id, totalAmount, reason],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} orgId
 * @param {string} periodStart YYYY-MM-DD
 */
export async function findActiveServiceBillForPeriod(orgId, periodStart) {
  const { rows } = await getPool().query(
    `SELECT ${BILL_SELECT}
     FROM service_bills
     WHERE org_id = $1 AND period_start = $2::date AND status <> 'voided'
     LIMIT 1`,
    [orgId, periodStart],
  );
  return rows[0] ?? null;
}

/**
 * Sum completed order payable amounts in [fromInclusive, toExclusive).
 * @param {string[]} orgIds
 * @param {string} fromInclusive ISO timestamptz
 * @param {string} toExclusive ISO timestamptz
 */
export async function sumCompletedPayableVolume(orgIds, fromInclusive, toExclusive) {
  if (!orgIds.length) return "0";
  const { rows } = await getPool().query(
    `SELECT COALESCE(SUM(payable_amount::numeric), 0)::text AS volume
     FROM payment_orders
     WHERE org_id = ANY($1::uuid[])
       AND status = 'completed'
       AND updated_at >= $2::timestamptz
       AND updated_at < $3::timestamptz`,
    [orgIds, fromInclusive, toExclusive],
  );
  return rows[0]?.volume ?? "0";
}
