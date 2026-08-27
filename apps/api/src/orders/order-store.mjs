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
 * @param {import("pg").Pool | import("pg").PoolClient | null | undefined} client
 */
function db(client) {
  return client ?? getPool();
}

/**
 * Serialize Mode C / D / S assign against concurrent creates for the same
 * merchant asset/network (transaction-scoped advisory lock).
 * @param {string} orgId
 * @param {string} asset
 * @param {string} network
 * @param {(client: import("pg").PoolClient) => Promise<T>} fn
 * @template T
 */
export async function withCreateOrderLock(orgId, asset, network, fn) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2::text))`,
      [orgId, `${asset}:${network}`],
    );
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {string} orgId
 * @param {string} idempotencyKey
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function findOrderByIdempotency(orgId, idempotencyKey, client) {
  const { rows } = await db(client).query(
    `SELECT ${ORDER_SELECT}
     FROM payment_orders
     WHERE org_id = $1 AND idempotency_key = $2`,
    [orgId, idempotencyKey],
  );
  return rows[0] ?? null;
}

/**
 * List payment orders in caller scope. Cap `limit` in the route.
 * @param {{
 *   kind: "all" | "filter",
 *   treeOrgIds?: string[],
 *   cashierOrgIds?: string[],
 *   createdBy?: string | null,
 *   orgId?: string | null,
 *   status?: string | null,
 *   limit: number,
 * }} query
 */
export async function listPaymentOrders(query) {
  const params = [];
  /** @type {string[]} */
  const where = [];

  if (query.kind === "filter") {
    const parts = [];
    if (query.treeOrgIds && query.treeOrgIds.length > 0) {
      params.push(query.treeOrgIds);
      parts.push(`org_id = ANY($${params.length}::uuid[])`);
    }
    if (query.cashierOrgIds && query.cashierOrgIds.length > 0) {
      params.push(query.cashierOrgIds);
      const orgIdx = params.length;
      params.push(query.createdBy);
      const userIdx = params.length;
      parts.push(
        `(org_id = ANY($${orgIdx}::uuid[]) AND created_by = $${userIdx})`,
      );
    }
    if (parts.length === 0) return [];
    where.push(`(${parts.join(" OR ")})`);
  }

  if (query.orgId) {
    params.push(query.orgId);
    where.push(`org_id = $${params.length}::uuid`);
  }
  if (query.status) {
    params.push(query.status);
    where.push(`status = $${params.length}`);
  }

  params.push(query.limit);
  const { rows } = await db().query(
    `SELECT ${ORDER_SELECT}
     FROM payment_orders
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows;
}

/**
 * @param {string} id
 */
export async function findOrderById(id) {
  const { rows } = await db().query(
    `SELECT o.id, o.org_id, o.created_by, o.order_number, o.status, o.matching_mode,
            o.payable_amount, o.received_amount, o.receive_address, o.address_source,
            o.hd_index, o.memo_or_tag, o.asset, o.network, o.expires_at, o.tx_hash,
            o.confirmations, o.required_confirmations, o.idempotency_key,
            o.idempotency_body_hash, o.merchant_metadata, o.created_at, o.updated_at,
            org.name AS org_name
     FROM payment_orders o
     JOIN org_accounts org ON org.id = o.org_id
     WHERE o.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Mode C reservation port — payable amounts for open statuses.
 * @param {import("pg").Pool | import("pg").PoolClient} client
 * @param {{
 *   merchantId: string,
 *   asset: string,
 *   network: string,
 *   receiveAddress: string,
 *   statuses: readonly string[],
 * }} query
 */
/**
 * @param {{ merchantId: string, merchantIds?: string[], asset: string, network: string, receiveAddress: string, statuses: readonly string[] }} query
 */
function merchantIdsOf(query) {
  if (Array.isArray(query.merchantIds) && query.merchantIds.length > 0) {
    return query.merchantIds;
  }
  return [query.merchantId];
}

export async function listReservedPayableAmounts(client, query) {
  const ids = merchantIdsOf(query);
  const { rows } = await client.query(
    `SELECT payable_amount
     FROM payment_orders
     WHERE org_id = ANY($1::uuid[])
       AND asset = $2
       AND network = $3
       AND receive_address = $4
       AND status = ANY($5::text[])`,
    [
      ids,
      query.asset,
      query.network,
      query.receiveAddress,
      [...query.statuses],
    ],
  );
  return rows.map((row) => row.payable_amount);
}

/**
 * Mode D reservation port — memo/tag values for open statuses.
 * @param {import("pg").Pool | import("pg").PoolClient} client
 * @param {{
 *   merchantId: string,
 *   asset: string,
 *   network: string,
 *   receiveAddress: string,
 *   statuses: readonly string[],
 * }} query
 */
export async function listReservedMemoOrTags(client, query) {
  const ids = merchantIdsOf(query);
  const { rows } = await client.query(
    `SELECT memo_or_tag
     FROM payment_orders
     WHERE org_id = ANY($1::uuid[])
       AND asset = $2
       AND network = $3
       AND receive_address = $4
       AND memo_or_tag IS NOT NULL
       AND status = ANY($5::text[])`,
    [
      ids,
      query.asset,
      query.network,
      query.receiveAddress,
      [...query.statuses],
    ],
  );
  return rows.map((row) => row.memo_or_tag);
}

/**
 * Mode S conflict port — any open order with the same payable (main or HD).
 * @param {import("pg").Pool | import("pg").PoolClient} client
 * @param {{
 *   merchantId: string,
 *   asset: string,
 *   network: string,
 *   payableAmount: string,
 *   statuses: readonly string[],
 * }} query
 */
export async function hasModeSSameAmountConflict(client, query) {
  const ids = merchantIdsOf(query);
  const { rows } = await client.query(
    `SELECT 1
     FROM payment_orders
     WHERE org_id = ANY($1::uuid[])
       AND asset = $2
       AND network = $3
       AND payable_amount = $4
       AND status = ANY($5::text[])
     LIMIT 1`,
    [
      ids,
      query.asset,
      query.network,
      query.payableAmount,
      [...query.statuses],
    ],
  );
  return rows.length > 0;
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
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function insertPaymentOrder(input, client) {
  try {
    const { rows } = await db(client).query(
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
