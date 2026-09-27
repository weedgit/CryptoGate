import { DEFAULT_ORDER_DELETE_DAYS, OrderStatus } from "@paymentgate/domain";
import { getPool } from "../db/pool.mjs";
import { findRetentionSettings } from "./retention-store.mjs";
import { walletGroupOrgIds } from "../sites/site-inherit.mjs";

/** Terminal statuses safe to purge after retention. Never touch open / anomaly. */
export const PURGEABLE_ORDER_STATUSES = [
  OrderStatus.Completed,
  OrderStatus.Expired,
  OrderStatus.Failed,
  OrderStatus.Cancelled,
];

/**
 * @param {number} days
 * @param {number} [min]
 * @param {number} [max]
 */
export function clampOrderDeleteDays(days, min = 7, max = 3650) {
  if (!Number.isFinite(days)) return DEFAULT_ORDER_DELETE_DAYS;
  return Math.min(max, Math.max(min, Math.trunc(days)));
}

/**
 * Delete one batch of terminal payment orders past retention for org ids.
 * @param {{
 *   orgIds: string[],
 *   orderDeleteDays: number,
 *   limit?: number,
 *   client?: import("pg").Pool | import("pg").PoolClient,
 * }} opts
 * @returns {Promise<number>} rows deleted
 */
export async function purgeTerminalOrdersBatch(opts) {
  const orgIds = Array.isArray(opts.orgIds)
    ? opts.orgIds.filter((id) => typeof id === "string" && id.length > 0)
    : [];
  if (orgIds.length === 0) return 0;

  const days = clampOrderDeleteDays(opts.orderDeleteDays);
  const limit = Math.min(
    2000,
    Math.max(1, Number(opts.limit) || 500),
  );
  const db = opts.client ?? getPool();

  const { rows } = await db.query(
    `WITH doomed AS (
       SELECT id
       FROM payment_orders
       WHERE org_id = ANY($1::uuid[])
         AND status = ANY($2::text[])
         AND created_at < now() - ($3::int * interval '1 day')
       ORDER BY created_at ASC
       LIMIT $4
     )
     DELETE FROM payment_orders po
     USING doomed
     WHERE po.id = doomed.id
     RETURNING po.id`,
    [orgIds, PURGEABLE_ORDER_STATUSES, days, limit],
  );
  return rows.length;
}

/**
 * Walk merchants: apply each merchant's orderDeleteDays to merchant + sites.
 * @param {{
 *   batchSize?: number,
 *   maxBatches?: number,
 *   client?: import("pg").Pool | import("pg").PoolClient,
 * }} [opts]
 * @returns {Promise<{ merchants: number, deleted: number }>}
 */
export async function purgeExpiredPaymentOrders(opts = {}) {
  const db = opts.client ?? getPool();
  const batchSize = Math.min(
    2000,
    Math.max(1, Number(opts.batchSize) || 500),
  );
  const maxBatches = Math.min(
    100,
    Math.max(1, Number(opts.maxBatches) || 20),
  );

  const { rows: merchants } = await db.query(
    `SELECT id, type
     FROM org_accounts
     WHERE type = 'merchant'
     ORDER BY id`,
  );

  let deleted = 0;
  for (const merchant of merchants) {
    const settings = await findRetentionSettings(merchant.id, db);
    const days = clampOrderDeleteDays(
      settings?.order_delete_days ?? DEFAULT_ORDER_DELETE_DAYS,
    );
    const orgIds = await walletGroupOrgIds(merchant, db);
    let batches = 0;
    while (batches < maxBatches) {
      const n = await purgeTerminalOrdersBatch({
        orgIds,
        orderDeleteDays: days,
        limit: batchSize,
        client: db,
      });
      deleted += n;
      batches += 1;
      if (n < batchSize) break;
    }
  }

  return { merchants: merchants.length, deleted };
}
