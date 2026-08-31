import { getPool } from "../db/pool.mjs";
import { DEFAULT_FULFILLMENT_POLICY } from "./fulfillment-policy-rules.mjs";

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
export async function findFulfillmentPolicySettings(orgId, client) {
  const { rows } = await db(client).query(
    `SELECT org_id, fulfillment_policy
     FROM merchant_fulfillment_settings
     WHERE org_id = $1`,
    [orgId],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} orgId
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function getEffectiveFulfillmentPolicy(orgId, client) {
  const row = await findFulfillmentPolicySettings(orgId, client);
  return row?.fulfillment_policy ?? DEFAULT_FULFILLMENT_POLICY;
}

/**
 * @param {{ orgId: string, fulfillmentPolicy: string }} input
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function upsertFulfillmentPolicySettings(input, client) {
  const { rows } = await db(client).query(
    `INSERT INTO merchant_fulfillment_settings (org_id, fulfillment_policy)
     VALUES ($1, $2)
     ON CONFLICT (org_id)
     DO UPDATE SET
       fulfillment_policy = EXCLUDED.fulfillment_policy,
       updated_at = now()
     RETURNING org_id, fulfillment_policy`,
    [input.orgId, input.fulfillmentPolicy],
  );
  return rows[0];
}
