import { getPool } from "../db/pool.mjs";

const SELECT = `
  id, payee_org_id, payee_name, payer, payer_org_id,
  period_key, period_label, platform_fee_collected, commission_percent,
  commission_amount, payout_status, payout_address, asset, network,
  payment_link, tx_ref, paid_at, created_at, updated_at
`;

/**
 * @param {{
 *   payer?: string,
 *   payeeOrgId?: string,
 *   payerOrgId?: string,
 *   limit?: number,
 * }} filter
 */
export async function listCommissionPayoutRows(filter = {}) {
  const clauses = [];
  const params = [];
  let i = 1;
  if (filter.payer) {
    clauses.push(`payer = $${i++}`);
    params.push(filter.payer);
  }
  if (filter.payeeOrgId) {
    clauses.push(`payee_org_id = $${i++}`);
    params.push(filter.payeeOrgId);
  }
  if (filter.payerOrgId) {
    clauses.push(`payer_org_id = $${i++}`);
    params.push(filter.payerOrgId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(Math.max(Number(filter.limit) || 200, 1), 500);
  params.push(limit);
  const { rows } = await getPool().query(
    `SELECT ${SELECT}
     FROM commission_payouts
     ${where}
     ORDER BY period_key DESC, updated_at DESC
     LIMIT $${i}`,
    params,
  );
  return rows;
}

/**
 * @param {string} id
 */
export async function findCommissionPayoutById(id) {
  const { rows } = await getPool().query(
    `SELECT ${SELECT} FROM commission_payouts WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * @param {{
 *   payer: string,
 *   payeeOrgId: string,
 *   periodKey: string,
 *   payerOrgId: string | null,
 * }} q
 */
export async function findCommissionPayoutByKey(q) {
  const { rows } = await getPool().query(
    `SELECT ${SELECT} FROM commission_payouts
     WHERE payer = $1
       AND payee_org_id = $2
       AND period_key = $3
       AND (
         ($4::uuid IS NULL AND payer_org_id IS NULL)
         OR payer_org_id = $4
       )`,
    [q.payer, q.payeeOrgId, q.periodKey, q.payerOrgId],
  );
  return rows[0] ?? null;
}

/**
 * @param {object} input
 */
export async function upsertCommissionPayoutRow(input) {
  const cur = await findCommissionPayoutByKey({
    payer: input.payer,
    payeeOrgId: input.payeeOrgId,
    periodKey: input.periodKey,
    payerOrgId: input.payerOrgId,
  });

  if (cur) {
    if (cur.payout_status === "paid") {
      const { rows } = await getPool().query(
        `UPDATE commission_payouts
         SET payee_name = $2,
             payout_address = COALESCE($3, payout_address),
             asset = COALESCE($4, asset),
             network = COALESCE($5, network),
             payment_link = $6,
             updated_at = now()
         WHERE id = $1
         RETURNING ${SELECT}`,
        [
          cur.id,
          input.payeeName,
          input.payoutAddress,
          input.asset,
          input.network,
          input.paymentLink,
        ],
      );
      return rows[0];
    }
    const { rows } = await getPool().query(
      `UPDATE commission_payouts
       SET payee_name = $2,
           period_label = $3,
           platform_fee_collected = $4,
           commission_percent = $5,
           commission_amount = $6,
           payout_status = 'ready',
           payout_address = $7,
           asset = $8,
           network = $9,
           payment_link = $10,
           updated_at = now()
       WHERE id = $1
       RETURNING ${SELECT}`,
      [
        cur.id,
        input.payeeName,
        input.periodLabel,
        input.platformFeeCollected,
        input.commissionPercent,
        input.commissionAmount,
        input.payoutAddress,
        input.asset,
        input.network,
        input.paymentLink,
      ],
    );
    return rows[0];
  }

  const { rows } = await getPool().query(
    `INSERT INTO commission_payouts (
       payee_org_id, payee_name, payer, payer_org_id,
       period_key, period_label, platform_fee_collected, commission_percent,
       commission_amount, payout_status, payout_address, asset, network,
       payment_link
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, 'ready', $10, $11, $12, $13
     )
     RETURNING ${SELECT}`,
    [
      input.payeeOrgId,
      input.payeeName,
      input.payer,
      input.payerOrgId,
      input.periodKey,
      input.periodLabel,
      input.platformFeeCollected,
      input.commissionPercent,
      input.commissionAmount,
      input.payoutAddress,
      input.asset,
      input.network,
      input.paymentLink,
    ],
  );
  return rows[0];
}

/**
 * @param {{ id: string, txRef: string }} input
 */
export async function markCommissionPayoutPaidRow(input) {
  const { rows } = await getPool().query(
    `UPDATE commission_payouts
     SET payout_status = 'paid',
         tx_ref = $2,
         paid_at = COALESCE(paid_at, now()),
         updated_at = now()
     WHERE id = $1
     RETURNING ${SELECT}`,
    [input.id, input.txRef],
  );
  return rows[0] ?? null;
}
