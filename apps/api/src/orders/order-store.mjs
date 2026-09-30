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
  invoice_amount_usd, invoice_currency, market_rate, pricing_rate,
  pricing_mode, rate_source, rate_fetched_at, quote_expires_at,
  pay_amount_base_units, asset_decimals,
  rate_sources, reference_rate, reference_source, rate_warning,
  invoice_amount, invoice_denomination, created_via, validity_seconds,
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
 *   creatorUserId?: string | null,
 *   orgId?: string | null,
 *   status?: string | null,
 *   statuses?: string[] | null,
 *   createdFrom?: string | null,
 *   createdTo?: string | null,
 *   q?: string | null,
 *   asset?: string | null,
 *   network?: string | null,
 *   createdVia?: "web" | "pos" | "api" | "unknown" | null,
 *   limit: number,
 *   offset?: number,
 * }} query
 * @returns {Promise<{
 *   rows: object[],
 *   total: number,
 *   limit: number,
 *   offset: number,
 *   summary: {
 *     count: number,
 *     invoiceAmountUsd: string | null,
 *     byAsset: { asset: string, payableAmount: string, receivedAmount: string }[],
 *   },
 * }>}
 */
export async function listPaymentOrders(query) {
  const params = [];
  /** @type {string[]} */
  const where = [];
  const limit = query.limit;
  const offset = Math.max(Number(query.offset) || 0, 0);

  if (query.kind === "filter") {
    const scope = appendPaymentOrderScope(query, params);
    if (scope.empty) {
      return {
        rows: [],
        total: 0,
        limit,
        offset,
        summary: { count: 0, invoiceAmountUsd: null, byAsset: [] },
      };
    }
    if (scope.clause) {
      where.push(scope.clause.replace(/^ AND /, ""));
    }
  }

  if (query.orgId) {
    params.push(query.orgId);
    where.push(`o.org_id = $${params.length}::uuid`);
  }
  if (query.statuses && query.statuses.length > 0) {
    params.push(query.statuses);
    where.push(`o.status = ANY($${params.length}::text[])`);
  } else if (query.status) {
    params.push(query.status);
    where.push(`o.status = $${params.length}`);
  }
  if (query.creatorUserId) {
    params.push(query.creatorUserId);
    where.push(`o.created_by = $${params.length}::uuid`);
  }
  if (query.createdFrom) {
    params.push(query.createdFrom);
    where.push(`o.created_at >= $${params.length}::timestamptz`);
  }
  if (query.createdTo) {
    params.push(query.createdTo);
    where.push(`o.created_at <= $${params.length}::timestamptz`);
  }
  if (query.asset) {
    params.push(query.asset);
    where.push(`o.asset = $${params.length}`);
  }
  if (query.network) {
    params.push(query.network);
    where.push(`o.network = $${params.length}`);
  }
  if (query.createdVia === "unknown") {
    where.push(`o.created_via IS NULL`);
  } else if (query.createdVia) {
    params.push(query.createdVia);
    where.push(`o.created_via = $${params.length}`);
  }
  if (query.q) {
    const q = query.q.trim();
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        q,
      )
    ) {
      params.push(q);
      where.push(`o.id = $${params.length}::uuid`);
    } else if (/^\d{4,}$/.test(q)) {
      params.push(q);
      where.push(`o.order_number = $${params.length}`);
    } else {
      params.push(q);
      where.push(
        `o.merchant_metadata->>'reference' ILIKE ($${params.length} || '%')`,
      );
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRes = await db().query(
    `SELECT count(*)::int AS n,
            coalesce(sum(o.invoice_amount_usd::numeric), 0)::text AS invoice_usd_sum,
            count(o.invoice_amount_usd)::int AS invoice_usd_n
     FROM payment_orders o
     ${whereSql}`,
    params,
  );
  const total = countRes.rows[0]?.n ?? 0;
  const invoiceUsdN = countRes.rows[0]?.invoice_usd_n ?? 0;
  const invoiceAmountUsd =
    invoiceUsdN > 0 ? (countRes.rows[0]?.invoice_usd_sum ?? null) : null;

  const assetRes = await db().query(
    `SELECT o.asset,
            coalesce(sum(o.payable_amount::numeric), 0)::text AS payable_sum,
            coalesce(sum(o.received_amount::numeric), 0)::text AS received_sum
     FROM payment_orders o
     ${whereSql}
     GROUP BY o.asset
     ORDER BY o.asset`,
    params,
  );
  const byAsset = assetRes.rows.map((row) => ({
    asset: row.asset,
    payableAmount: row.payable_sum,
    receivedAmount: row.received_sum,
  }));

  const listParams = [...params, limit, offset];
  const { rows } = await db().query(
    `SELECT ${ORDER_SELECT_O},
            org.name AS org_name,
            COALESCE(org.business_timezone, parent_org.business_timezone) AS business_timezone,
            creator.email AS creator_email,
            nullif(
              btrim(concat_ws(' ', creator.first_name, creator.last_name)),
              ''
            ) AS creator_name,
            creator.avatar_url AS creator_avatar_url
     FROM payment_orders o
     JOIN org_accounts org ON org.id = o.org_id
     LEFT JOIN org_accounts parent_org
       ON parent_org.id = org.parent_id AND org.type = 'merchant_site'
     LEFT JOIN users creator ON creator.id = o.created_by
     ${whereSql}
     ORDER BY o.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    listParams,
  );
  return {
    rows,
    total,
    limit,
    offset,
    summary: {
      count: total,
      invoiceAmountUsd,
      byAsset,
    },
  };
}

/**
 * @param {string} id
 */
export async function findOrderById(id) {
  const { rows } = await db().query(
    `SELECT ${ORDER_SELECT_O},
            org.name AS org_name,
            COALESCE(org.business_timezone, parent_org.business_timezone) AS business_timezone,
            creator.email AS creator_email,
            nullif(
              btrim(concat_ws(' ', creator.first_name, creator.last_name)),
              ''
            ) AS creator_name,
            creator.avatar_url AS creator_avatar_url
     FROM payment_orders o
     JOIN org_accounts org ON org.id = o.org_id
     LEFT JOIN org_accounts parent_org
       ON parent_org.id = org.parent_id AND org.type = 'merchant_site'
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

/**
 * Re-quote runs matching for an order that already holds a reservation;
 * it must not collide with itself.
 * @param {{ excludeOrderId?: string | null }} query
 */
function excludeIdOf(query) {
  return query.excludeOrderId ?? null;
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
       AND status = ANY($5::text[])
       AND ($6::uuid IS NULL OR id <> $6::uuid)`,
    [
      ids,
      query.asset,
      query.network,
      query.receiveAddress,
      [...query.statuses],
      excludeIdOf(query),
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
       AND status = ANY($5::text[])
       AND ($6::uuid IS NULL OR id <> $6::uuid)`,
    [
      ids,
      query.asset,
      query.network,
      query.receiveAddress,
      [...query.statuses],
      excludeIdOf(query),
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
       AND ($7::uuid IS NULL OR o.id <> $7::uuid)
     ORDER BY o.created_at ASC
     LIMIT 1`,
    [
      ids,
      query.asset,
      query.network,
      query.receiveAddress,
      query.payableAmount,
      [...query.statuses],
      excludeIdOf(query),
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
       AND ($6::uuid IS NULL OR id <> $6::uuid)
     LIMIT 1`,
    [
      ids,
      query.asset,
      query.network,
      query.payableAmount,
      [...query.statuses],
      excludeIdOf(query),
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
 *   createdVia?: "web" | "pos" | "api" | null,
 *   terminalId?: string | null,
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
         underpay_tolerance, fulfillment_policy,
         invoice_amount_usd, invoice_currency, market_rate, pricing_rate,
         pricing_mode, rate_source, rate_fetched_at, quote_expires_at,
         pay_amount_base_units, asset_decimals,
         rate_sources, reference_rate, reference_source, rate_warning,
         invoice_amount, invoice_denomination, created_via, validity_seconds, terminal_id
       ) VALUES (
         $1, $2,
         'CG-' || to_char(now() AT TIME ZONE 'utc', 'YYYY') || '-' ||
           lpad(nextval('payment_orders_order_number_seq')::text, 6, '0'),
         $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
         $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
         $29::jsonb, $30, $31, $32, $33, $34, $35, $36, $37
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
        input.invoiceAmountUsd ?? input.payableAmount,
        input.invoiceCurrency ?? "USD",
        input.marketRate ?? null,
        input.pricingRate ?? null,
        input.pricingMode ?? null,
        input.rateSource ?? null,
        input.rateFetchedAt ?? null,
        input.quoteExpiresAt ?? null,
        input.payAmountBaseUnits ?? null,
        input.assetDecimals ?? null,
        input.rateSources ? JSON.stringify(input.rateSources) : null,
        input.referenceRate ?? null,
        input.referenceSource ?? null,
        input.rateWarning ?? null,
        input.invoiceAmount ?? input.invoiceAmountUsd ?? input.payableAmount,
        input.invoiceDenomination ?? "fiat",
        input.createdVia ?? null,
        input.validitySeconds ?? null,
        input.terminalId ?? null,
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
 * Lock a pending, unexpired order row for re-quote.
 * @param {import("pg").PoolClient} client
 * @param {string} orderId
 */
export async function lockQuotableOrder(client, orderId) {
  const { rows } = await client.query(
    `SELECT ${ORDER_SELECT}
     FROM payment_orders
     WHERE id = $1::uuid
       AND status = 'pending_payment'
       AND expires_at > now()
     FOR UPDATE`,
    [orderId],
  );
  return rows[0] ?? null;
}

/**
 * Replace the quote and the matching assignment of a pending order.
 * @param {import("pg").PoolClient} client
 * @param {string} orderId
 * @param {{
 *   asset: string,
 *   network: string,
 *   matchingMode: string,
 *   payableAmount: string,
 *   receiveAddress: string,
 *   addressSource: string,
 *   hdIndex: number | null,
 *   memoOrTag: string | null,
 *   requiredConfirmations: number,
 *   expiresAt: Date,
 *   quote: {
 *     invoiceAmountUsd: string,
 *     marketRate: string,
 *     pricingRate: string,
 *     pricingMode: string,
 *     rateSource: string,
 *     rateFetchedAt: string,
 *     quoteExpiresAt: string,
 *     payAmountBaseUnits: string,
 *     assetDecimals: number,
 *     rateSources?: unknown,
 *     referenceRate?: string | null,
 *     referenceSource?: string | null,
 *     rateWarning?: string | null,
 *   },
 * }} input
 */
export async function applyOrderRequote(client, orderId, input) {
  const q = input.quote;
  const { rows } = await client.query(
    `UPDATE payment_orders
     SET asset = $2,
         network = $3,
         matching_mode = $4,
         payable_amount = $5,
         receive_address = $6,
         address_source = $7,
         hd_index = $8,
         memo_or_tag = $9,
         required_confirmations = $10,
         expires_at = $11,
         invoice_amount_usd = $12,
         market_rate = $13,
         pricing_rate = $14,
         pricing_mode = $15,
         rate_source = $16,
         rate_fetched_at = $17::timestamptz,
         quote_expires_at = $18::timestamptz,
         pay_amount_base_units = $19,
         asset_decimals = $20,
         rate_sources = $21::jsonb,
         reference_rate = $22,
         reference_source = $23,
         rate_warning = $24,
         updated_at = now()
     WHERE id = $1::uuid
       AND status = 'pending_payment'
     RETURNING ${ORDER_SELECT}`,
    [
      orderId,
      input.asset,
      input.network,
      input.matchingMode,
      input.payableAmount,
      input.receiveAddress,
      input.addressSource,
      input.hdIndex,
      input.memoOrTag,
      input.requiredConfirmations,
      input.expiresAt,
      q.invoiceAmountUsd,
      q.marketRate,
      q.pricingRate,
      q.pricingMode,
      q.rateSource,
      q.rateFetchedAt,
      q.quoteExpiresAt,
      q.payAmountBaseUnits,
      q.assetDecimals,
      q.rateSources ? JSON.stringify(q.rateSources) : null,
      q.referenceRate ?? null,
      q.referenceSource ?? null,
      q.rateWarning ?? null,
    ],
  );
  return rows[0] ?? null;
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
       AND ($7::uuid IS NULL OR o.id <> $7::uuid)
     ORDER BY o.created_at ASC
     LIMIT 1`,
    [
      ids,
      query.asset,
      query.network,
      query.receiveAddress,
      memo,
      [...query.statuses],
      excludeIdOf(query),
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
