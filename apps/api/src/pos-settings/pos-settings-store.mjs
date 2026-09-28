import { getPool } from "../db/pool.mjs";

/**
 * @param {import("pg").Pool | import("pg").PoolClient | null | undefined} client
 */
function db(client) {
  return client ?? getPool();
}

export const DEFAULT_CASHIER_WEB_ORDERS = true;

/**
 * @param {string} orgId
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function findPosSettings(orgId, client) {
  const { rows } = await db(client).query(
    `SELECT org_id, cashier_web_orders
     FROM merchant_pos_settings
     WHERE org_id = $1`,
    [orgId],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} orgId
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function getEffectiveCashierWebOrders(orgId, client) {
  const row = await findPosSettings(orgId, client);
  return row ? row.cashier_web_orders === true : DEFAULT_CASHIER_WEB_ORDERS;
}

/**
 * @param {{ orgId: string, cashierWebOrders: boolean }} input
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function upsertPosSettings(input, client) {
  const { rows } = await db(client).query(
    `INSERT INTO merchant_pos_settings (org_id, cashier_web_orders)
     VALUES ($1, $2)
     ON CONFLICT (org_id)
     DO UPDATE SET
       cashier_web_orders = EXCLUDED.cashier_web_orders,
       updated_at = now()
     RETURNING org_id, cashier_web_orders`,
    [input.orgId, input.cashierWebOrders],
  );
  return rows[0];
}
