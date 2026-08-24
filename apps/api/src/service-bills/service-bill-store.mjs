import { getPool } from "../db/pool.mjs";

const BILL_SELECT = `
  id, org_id, period_start, period_end, subscription_amount, volume_fee_amount,
  total_amount, currency, status, due_at, created_at, updated_at
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
