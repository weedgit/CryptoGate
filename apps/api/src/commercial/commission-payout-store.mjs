import { getPool } from "../db/pool.mjs";

const SELECT = `
  id, payee_org_id, payee_name, payer, payer_org_id,
  period_key, period_label, platform_fee_collected, commission_percent,
  commission_amount, payout_status, payout_address, asset, network,
  payment_link, tx_ref, note, paid_at, settled_at, agent_confirmed_by,
  tree_snapshot, created_at, updated_at
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
 * Create or refresh an issued monthly invoice. No-op (null) if paid/settled.
 * @param {object} input
 */
export async function upsertIssuedCommissionInvoiceRow(input) {
  const cur = await findCommissionPayoutByKey({
    payer: "platform",
    payeeOrgId: input.payeeOrgId,
    periodKey: input.periodKey,
    payerOrgId: null,
  });

  if (cur) {
    if (cur.payout_status === "paid" || cur.payout_status === "settled") {
      return null;
    }
    const { rows } = await getPool().query(
      `UPDATE commission_payouts
       SET payee_name = $2,
           period_label = $3,
           platform_fee_collected = $4,
           commission_percent = $5,
           commission_amount = $6,
           payout_status = 'issued',
           payout_address = $7,
           asset = $8,
           network = $9,
           payment_link = $10,
           tree_snapshot = $11::jsonb,
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
        JSON.stringify(input.treeSnapshot ?? null),
      ],
    );
    return rows[0];
  }

  const { rows } = await getPool().query(
    `INSERT INTO commission_payouts (
       payee_org_id, payee_name, payer, payer_org_id,
       period_key, period_label, platform_fee_collected, commission_percent,
       commission_amount, payout_status, payout_address, asset, network,
       payment_link, tree_snapshot
     ) VALUES (
       $1, $2, 'platform', NULL, $3, $4, $5, $6, $7, 'issued', $8, $9, $10, $11, $12::jsonb
     )
     RETURNING ${SELECT}`,
    [
      input.payeeOrgId,
      input.payeeName,
      input.periodKey,
      input.periodLabel,
      input.platformFeeCollected,
      input.commissionPercent,
      input.commissionAmount,
      input.payoutAddress,
      input.asset,
      input.network,
      input.paymentLink,
      JSON.stringify(input.treeSnapshot ?? null),
    ],
  );
  return rows[0];
}

/**
 * Agent → sub slip prepare (ready).
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
    if (
      cur.payout_status === "paid" ||
      cur.payout_status === "verifying" ||
      cur.payout_status === "settled"
    ) {
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
 * Confirm remittance sent → Verification (agent → sub).
 * @param {{ id: string, note: string | null }} input
 */
export async function markCommissionPayoutVerifyingRow(input) {
  const { rows } = await getPool().query(
    `UPDATE commission_payouts
     SET payout_status = 'verifying',
         note = COALESCE($2, note),
         updated_at = now()
     WHERE id = $1
       AND payout_status IN ('ready', 'verifying')
     RETURNING ${SELECT}`,
    [input.id, input.note],
  );
  return rows[0] ?? null;
}

/**
 * Platform invoice: issued → paid (awaiting agent confirm).
 * Agent→sub: ready|verifying → paid (terminal for cascade).
 * @param {{ id: string, txRef: string | null, note: string | null }} input
 */
export async function markCommissionPayoutPaidRow(input) {
  const { rows } = await getPool().query(
    `UPDATE commission_payouts
     SET payout_status = 'paid',
         tx_ref = COALESCE($2, tx_ref),
         note = COALESCE($3, note),
         paid_at = COALESCE(paid_at, now()),
         updated_at = now()
     WHERE id = $1
       AND payout_status IN ('issued', 'ready', 'verifying')
     RETURNING ${SELECT}`,
    [input.id, input.txRef, input.note],
  );
  return rows[0] ?? null;
}

/**
 * Agent confirms receipt → settled (Payout history).
 * @param {{ id: string, userId: string }} input
 */
export async function markCommissionPayoutSettledRow(input) {
  const { rows } = await getPool().query(
    `UPDATE commission_payouts
     SET payout_status = 'settled',
         settled_at = COALESCE(settled_at, now()),
         agent_confirmed_by = $2,
         updated_at = now()
     WHERE id = $1
       AND payer = 'platform'
       AND payout_status = 'paid'
     RETURNING ${SELECT}`,
    [input.id, input.userId],
  );
  return rows[0] ?? null;
}
