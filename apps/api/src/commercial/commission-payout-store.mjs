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
 *   status?: string | string[],
 *   limit?: number,
 *   offset?: number,
 * }} [filter]
 * @returns {Promise<{ rows: object[], total: number, limit: number, offset: number }>}
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
  const statuses = normalizeStatusFilter(filter.status);
  if (statuses) {
    clauses.push(`payout_status = ANY($${i++}::text[])`);
    params.push(statuses);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(Math.max(Number(filter.limit) || 200, 1), 500);
  const offset = Math.max(Number(filter.offset) || 0, 0);

  const countRes = await getPool().query(
    `SELECT count(*)::int AS n FROM commission_payouts ${where}`,
    params,
  );
  const total = countRes.rows[0]?.n ?? 0;

  const listParams = [...params, limit, offset];
  const { rows } = await getPool().query(
    `SELECT ${SELECT}
     FROM commission_payouts
     ${where}
     ORDER BY period_key DESC, updated_at DESC
     LIMIT $${i++} OFFSET $${i}`,
    listParams,
  );
  return { rows, total, limit, offset };
}

/**
 * @param {string | string[] | undefined | null} raw
 * @returns {string[] | null}
 */
function normalizeStatusFilter(raw) {
  if (raw == null) return null;
  const list = Array.isArray(raw)
    ? raw
    : String(raw)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  const allowed = new Set(["issued", "paid", "settled"]);
  const statuses = [...new Set(list.filter((s) => allowed.has(s)))];
  return statuses.length ? statuses : null;
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
 *   payeeOrgId: string,
 *   periodKey: string,
 * }} q
 */
export async function findCommissionPayoutByKey(q) {
  const { rows } = await getPool().query(
    `SELECT ${SELECT} FROM commission_payouts
     WHERE payer = 'platform'
       AND payee_org_id = $1
       AND period_key = $2
       AND payer_org_id IS NULL`,
    [q.payeeOrgId, q.periodKey],
  );
  return rows[0] ?? null;
}

/**
 * Create or refresh an issued monthly invoice (platform → agent).
 * No-op (null) if paid/settled.
 * @param {object} input
 */
export async function upsertIssuedCommissionInvoiceRow(input) {
  const cur = await findCommissionPayoutByKey({
    payeeOrgId: input.payeeOrgId,
    periodKey: input.periodKey,
  });

  if (cur) {
    if (cur.payout_status === "paid" || cur.payout_status === "settled") {
      return null;
    }
    const paymentLink = `/platform/commissions/${cur.id}`;
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
        paymentLink,
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
      input.paymentLink ?? "",
      JSON.stringify(input.treeSnapshot ?? null),
    ],
  );
  const inserted = rows[0];
  if (!inserted) return null;
  const paymentLink = `/platform/commissions/${inserted.id}`;
  if (inserted.payment_link === paymentLink) return inserted;
  const { rows: fixed } = await getPool().query(
    `UPDATE commission_payouts
     SET payment_link = $2, updated_at = now()
     WHERE id = $1
     RETURNING ${SELECT}`,
    [inserted.id, paymentLink],
  );
  return fixed[0] ?? inserted;
}

/**
 * Latest received (paid/settled) platform → agent commission for a payee in a period.
 * @param {string} payeeOrgId
 * @param {string} periodKey
 */
export async function findReceivedCommissionForPayee(payeeOrgId, periodKey) {
  const { rows } = await getPool().query(
    `SELECT ${SELECT}
     FROM commission_payouts
     WHERE payee_org_id = $1
       AND period_key = $2
       AND payer = 'platform'
       AND payout_status IN ('paid', 'settled')
     ORDER BY updated_at DESC
     LIMIT 1`,
    [payeeOrgId, periodKey],
  );
  return rows[0] ?? null;
}

/**
 * Platform invoice: issued → paid (awaiting agent confirm).
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
       AND payout_status = 'issued'
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
       AND payout_status = 'paid'
     RETURNING ${SELECT}`,
    [input.id, input.userId],
  );
  return rows[0] ?? null;
}
