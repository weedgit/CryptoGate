import { getPool } from "../db/pool.mjs";
import { toPaymentOrder } from "./order-map.mjs";

const ORDER_SELECT = `
  id, org_id, created_by, order_number, status, matching_mode,
  payable_amount, received_amount, receive_address, address_source,
  hd_index, memo_or_tag, asset, network, expires_at, tx_hash,
  confirmations, required_confirmations, idempotency_key,
  idempotency_body_hash, merchant_metadata, created_at, updated_at
`;

/**
 * @param {string} orgId
 * @param {string} idempotencyKey
 */
export async function findOrderByIdempotency(orgId, idempotencyKey) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${ORDER_SELECT}
     FROM payment_orders
     WHERE org_id = $1 AND idempotency_key = $2`,
    [orgId, idempotencyKey],
  );
  return rows[0] ?? null;
}

/**
 * @param {{
 *   orgId: string,
 *   createdBy: string,
 *   status: string,
 *   matchingMode: string,
 *   payableAmount: string,
 *   receiveAddress: string,
 *   addressSource: string,
 *   hdIndex: number | null,
 *   memoOrTag: string | null,
 *   asset: string,
 *   network: string,
 *   expiresAt: Date,
 *   requiredConfirmations: number,
 *   idempotencyKey: string,
 *   idempotencyBodyHash: string,
 *   merchantMetadata: unknown,
 * }} input
 */
export async function insertPaymentOrder(input) {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `INSERT INTO payment_orders (
         org_id, created_by, order_number, status, matching_mode,
         payable_amount, receive_address, address_source, hd_index, memo_or_tag,
         asset, network, expires_at, required_confirmations,
         idempotency_key, idempotency_body_hash, merchant_metadata
       ) VALUES (
         $1, $2,
         'CG-' || to_char(now() AT TIME ZONE 'utc', 'YYYY') || '-' ||
           lpad(nextval('payment_orders_order_number_seq')::text, 6, '0'),
         $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
       )
       RETURNING ${ORDER_SELECT}`,
      [
        input.orgId,
        input.createdBy,
        input.status,
        input.matchingMode,
        input.payableAmount,
        input.receiveAddress,
        input.addressSource,
        input.hdIndex,
        input.memoOrTag,
        input.asset,
        input.network,
        input.expiresAt,
        input.requiredConfirmations,
        input.idempotencyKey,
        input.idempotencyBodyHash,
        input.merchantMetadata,
      ],
    );
    return { ok: true, row: rows[0] };
  } catch (err) {
    if (err && err.code === "23505") {
      if (err.constraint === "payment_orders_org_idempotency_unique") {
        return { ok: false, code: "idempotency_conflict" };
      }
      throw err;
    }
    throw err;
  }
}

export { toPaymentOrder };
