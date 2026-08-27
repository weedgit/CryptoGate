import { getPool } from "../db/pool.mjs";

/**
 * @param {import("pg").Pool | import("pg").PoolClient | null | undefined} client
 */
function db(client) {
  return client ?? getPool();
}

/**
 * @param {string} orgId
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function findRetentionSettings(orgId, client) {
  const { rows } = await db(client).query(
    `SELECT org_id, order_delete_days
     FROM merchant_retention_settings
     WHERE org_id = $1`,
    [orgId],
  );
  return rows[0] ?? null;
}

/**
 * @param {{ orgId: string, orderDeleteDays: number }} input
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function upsertRetentionSettings(input, client) {
  const { rows } = await db(client).query(
    `INSERT INTO merchant_retention_settings (org_id, order_delete_days)
     VALUES ($1, $2)
     ON CONFLICT (org_id)
     DO UPDATE SET order_delete_days = EXCLUDED.order_delete_days, updated_at = now()
     RETURNING org_id, order_delete_days`,
    [input.orgId, input.orderDeleteDays],
  );
  return rows[0];
}
