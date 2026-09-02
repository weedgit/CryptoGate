import { getPool } from "../db/pool.mjs";
import { toPaymentOrder } from "./order-map.mjs";
import { appendPaymentOrderScope } from "./order-scope-sql.mjs";

const ORDER_SELECT = `
  id, org_id, created_by, order_number, status, matching_mode,
  payable_amount, received_amount, receive_address, address_source,
  hd_index, memo_or_tag, asset, network, expires_at, tx_hash,
  from_address, confirmed_at,
  confirmations, required_confirmations, idempotency_key,
  idempotency_body_hash, merchant_metadata, underpay_tolerance,
  fulfillment_policy,
  anomaly_reason, anomaly_resolution_note, anomaly_resolved_at,
  created_at, updated_at
`;

/** Same columns with `o.` prefix for joins to org_accounts / users. */
const ORDER_SELECT_O = ORDER_SELECT.split(",")
  .map((col) => `o.${col.trim()}`)
  .join(",\n            ");

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
    const scope = appendPaymentOrderScope(query, params);
    if (scope.empty) return [];
    if (scope.clause) {
      where.push(scope.clause.replace(/^ AND /, ""));
    }
  }

  if (query.orgId) {
    params.push(query.orgId);
    where.push(`o.org_id = $${params.length}::uuid`);
  }
  if (query.status) {
    params.push(query.status);
    where.push(`o.status = $${params.length}`);
  }

  params.push(query.limit);
  const { rows } = await db().query(
    `SELECT ${ORDER_SELECT_O},
            org.name AS org_name,
            creator.email AS creator_email
     FROM payment_orders o
     JOIN org_accounts org ON org.id = o.org_id
     LEFT JOIN users creator ON creator.id = o.created_by
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY o.created_at DESC
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
    `SELECT ${ORDER_SELECT_O},
            org.name AS org_name,
            creator.email AS creator_email
     FROM payment_orders o
     JOIN org_accounts org ON org.id = o.org_id
     LEFT JOIN users creator ON creator.id = o.created_by
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
 * Mode B create lock — earliest open order on this main address + payable amount.
 * @param {import("pg").Pool | import("pg").PoolClient} client
 * @param {{
 *   merchantId: string,
 *   merchantIds?: string[],
 *   asset: string,
 *   network: string,
 *   receiveAddress: string,
 *   payableAmount: string,
 *   statuses: readonly string[],
 * }} query
 */
export async function findModeBSameAmountCreateConflict(client, query) {
  const ids = merchantIdsOf(query);
  const { rows } = await client.query(
    `SELECT o.id, o.order_number, o.status, o.payable_amount::text AS payable_amount,
            o.asset, o.network, o.receive_address, o.created_at, o.created_by,
            creator.email AS created_by_email
     FROM payment_orders o
     LEFT JOIN users creator ON creator.id = o.created_by
     WHERE o.org_id = ANY($1::uuid[])
       AND o.asset = $2
       AND o.network = $3
       AND o.receive_address = $4
       AND o.payable_amount::numeric = $5::numeric
       AND o.status = ANY($6::text[])
     ORDER BY o.created_at ASC
     LIMIT 1`,
    [
      ids,
      query.asset,
      query.network,
      query.receiveAddress,
      query.payableAmount,
      [...query.statuses],
    ],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    payableAmount: row.payable_amount,
    asset: row.asset,
    network: row.network,
    receiveAddress: row.receive_address,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
    createdBy: row.created_by ?? null,
    createdByEmail: row.created_by_email ?? null,
  };
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
 *   underpayTolerance?: string,
 *   fulfillmentPolicy?: string,
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
         idempotency_key, idempotency_body_hash, merchant_metadata,
         underpay_tolerance, fulfillment_policy
       ) VALUES (
         $1, $2,
         'CG-' || to_char(now() AT TIME ZONE 'utc', 'YYYY') || '-' ||
           lpad(nextval('payment_orders_order_number_seq')::text, 6, '0'),
         $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
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
        input.underpayTolerance ?? "0",
        input.fulfillmentPolicy ?? "on_completed",
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

/**
 * Cancel a pending payment order (frees Mode B amount / Mode D memo slot).
 * @param {string} orderId
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function cancelPendingPaymentOrder(orderId, client) {
  const { rows } = await db(client).query(
    `UPDATE payment_orders
     SET status = 'cancelled',
         updated_at = now()
     WHERE id = $1::uuid
       AND status = 'pending_payment'
     RETURNING ${ORDER_SELECT}`,
    [orderId],
  );
  return rows[0] ?? null;
}

/**
 * Close a payment anomaly after staff reconcile (note required by route).
 * Status → cancelled; anomaly_reason kept for invoice/audit.
 * @param {string} orderId
 * @param {string} note
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function resolvePaymentAnomaly(orderId, note, client) {
  const { rows } = await db(client).query(
    `UPDATE payment_orders
     SET status = 'cancelled',
         anomaly_resolution_note = $2,
         anomaly_resolved_at = now(),
         updated_at = now()
     WHERE id = $1::uuid
       AND status = 'payment_anomaly'
     RETURNING ${ORDER_SELECT}`,
    [orderId, note],
  );
  return rows[0] ?? null;
}

/**
 * Mode D create lock — open order already holding this memo on the main address.
 * @param {import("pg").Pool | import("pg").PoolClient} client
 * @param {{
 *   merchantId: string,
 *   merchantIds?: string[],
 *   asset: string,
 *   network: string,
 *   receiveAddress: string,
 *   memoOrTag: string,
 *   statuses: readonly string[],
 * }} query
 */
export async function findModeDSameMemoCreateConflict(client, query) {
  const memo = String(query.memoOrTag ?? "").trim();
  if (!memo) return null;
  const ids = merchantIdsOf(query);
  const { rows } = await client.query(
    `SELECT o.id, o.order_number, o.status, o.payable_amount::text AS payable_amount,
            o.asset, o.network, o.receive_address, o.memo_or_tag, o.created_at,
            o.created_by, creator.email AS created_by_email
     FROM payment_orders o
     LEFT JOIN users creator ON creator.id = o.created_by
     WHERE o.org_id = ANY($1::uuid[])
       AND o.asset = $2
       AND o.network = $3
       AND o.receive_address = $4
       AND o.memo_or_tag = $5
       AND o.status = ANY($6::text[])
     ORDER BY o.created_at ASC
     LIMIT 1`,
    [
      ids,
      query.asset,
      query.network,
      query.receiveAddress,
      memo,
      [...query.statuses],
    ],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    payableAmount: row.payable_amount,
    asset: row.asset,
    network: row.network,
    receiveAddress: row.receive_address,
    memoOrTag: row.memo_or_tag,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
    createdBy: row.created_by ?? null,
    createdByEmail: row.created_by_email ?? null,
  };
}

export { toPaymentOrder };
