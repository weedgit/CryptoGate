import { getPool } from "../db/pool.mjs";

const BILL_SELECT = `
  id, org_id, period_start, period_end, subscription_amount, volume_fee_amount,
  total_amount, currency, status, due_at, paid_at, voided_at,
  last_adjustment_reason, last_adjustment_amount, payment_reference,
  rx_address, tx_address, created_at, updated_at,
  tier, volume_fee_percent, billed_volume_usd
`;

const BILL_SELECT_LEGACY = `
  id, org_id, period_start, period_end, subscription_amount, volume_fee_amount,
  total_amount, currency, status, due_at, paid_at, voided_at,
  last_adjustment_reason, payment_reference, created_at, updated_at
`;

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 */
async function queryBills(sql, params = []) {
  try {
    return await getPool().query(sql, params);
  } catch (err) {
    if (err && err.code === "42703") {
      if (sql.includes("rx_address") || sql.includes("tx_address")) {
        const stripped = sql
          .replace(/,\s*rx_address/g, "")
          .replace(/,\s*tx_address/g, "")
          .replace(/rx_address\s*=\s*\$\d+,?\s*/g, "")
          .replace(/tx_address\s*=\s*\$\d+,?\s*/g, "");
        try {
          return await getPool().query(stripped, params);
        } catch (inner) {
          if (!(inner && inner.code === "42703")) throw inner;
        }
      }
      if (sql.includes("last_adjustment_amount")) {
        const stripped = sql
          .replace(/,\s*last_adjustment_amount/g, "")
          .replace(/last_adjustment_amount\s*=\s*\$\d+,?\s*/g, "");
        try {
          return await getPool().query(stripped, params);
        } catch (inner) {
          if (!(inner && inner.code === "42703")) throw inner;
        }
      }
      if (sql.includes("tier")) {
        return getPool().query(sql.replace(BILL_SELECT, BILL_SELECT_LEGACY), params);
      }
    }
    throw err;
  }
}

/**
 * @param {string} id
 */
export async function findServiceBillById(id) {
  const { rows } = await queryBills(
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
  const { rows } = await queryBills(
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
 *   tier?: string | null,
 *   volumeFeePercent?: string | null,
 *   billedVolumeUsd?: string | null,
 * }} input
 */
export async function insertServiceBill(input) {
  const values = [
    input.orgId,
    input.periodStart,
    input.periodEnd,
    input.subscriptionAmount,
    input.volumeFeeAmount,
    input.totalAmount,
    input.status,
    input.dueAt,
    input.tier ?? null,
    input.volumeFeePercent ?? null,
    input.billedVolumeUsd ?? null,
  ];
  try {
    const { rows } = await getPool().query(
      `INSERT INTO service_bills (
         org_id, period_start, period_end, subscription_amount, volume_fee_amount,
         total_amount, currency, status, due_at,
         tier, volume_fee_percent, billed_volume_usd
       ) VALUES ($1, $2::date, $3::date, $4, $5, $6, 'USD', $7, $8::timestamptz, $9, $10, $11)
       RETURNING ${BILL_SELECT}`,
      values,
    );
    return rows[0];
  } catch (err) {
    if (err && err.code === "42703") {
      const { rows } = await getPool().query(
        `INSERT INTO service_bills (
           org_id, period_start, period_end, subscription_amount, volume_fee_amount,
           total_amount, currency, status, due_at
         ) VALUES ($1, $2::date, $3::date, $4, $5, $6, 'USD', $7, $8::timestamptz)
         RETURNING ${BILL_SELECT_LEGACY}`,
        values.slice(0, 8),
      );
      return rows[0];
    }
    throw err;
  }
}

/**
 * @param {string} id
 * @param {{
 *   paymentReference?: string | null,
 *   rxAddress?: string | null,
 *   txAddress?: string | null,
 * }} [receipt]
 */
export async function markServiceBillPaid(id, receipt = {}) {
  const paymentReference = receipt.paymentReference ?? null;
  const rxAddress = receipt.rxAddress ?? null;
  const txAddress = receipt.txAddress ?? null;
  try {
    const { rows } = await getPool().query(
      `UPDATE service_bills
       SET status = 'paid',
           paid_at = now(),
           payment_reference = $2,
           rx_address = $3,
           tx_address = $4,
           updated_at = now()
       WHERE id = $1 AND status IN ('issued', 'overdue')
       RETURNING ${BILL_SELECT}`,
      [id, paymentReference, rxAddress, txAddress],
    );
    return rows[0] ?? null;
  } catch (err) {
    if (!(err && err.code === "42703")) throw err;
    const { rows } = await queryBills(
      `UPDATE service_bills
       SET status = 'paid', paid_at = now(), payment_reference = $2, updated_at = now()
       WHERE id = $1 AND status IN ('issued', 'overdue')
       RETURNING ${BILL_SELECT}`,
      [id, paymentReference],
    );
    return rows[0] ?? null;
  }
}

/**
 * @param {string} id
 * @param {string} reason
 */
export async function voidServiceBill(id, _reason) {
  const { rows } = await queryBills(
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
 * @param {string} adjustmentAmount signed USD delta
 */
export async function adjustServiceBill(id, totalAmount, reason, adjustmentAmount) {
  const { rows } = await queryBills(
    `UPDATE service_bills
     SET total_amount = $2,
         last_adjustment_reason = $3,
         last_adjustment_amount = $4,
         updated_at = now()
     WHERE id = $1 AND status IN ('issued', 'overdue')
     RETURNING ${BILL_SELECT}`,
    [id, totalAmount, reason, adjustmentAmount],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} orgId
 * @param {string} periodStart YYYY-MM-DD
 */
export async function findActiveServiceBillForPeriod(orgId, periodStart) {
  const { rows } = await queryBills(
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
