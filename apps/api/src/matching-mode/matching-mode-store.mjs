import { getPool } from "../db/pool.mjs";
import { DEFAULT_MATCHING_MODE } from "./matching-mode-rules.mjs";

/**
 * @param {import("pg").Pool | import("pg").PoolClient | null | undefined} client
 */
function db(client) {
  return client ?? getPool();
}

/**
 * @param {string} orgId
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 * @returns {Promise<{ org_id: string, matching_mode: string } | null>}
 */
export async function findMatchingModeSettings(orgId, client) {
  const { rows } = await db(client).query(
    `SELECT org_id, matching_mode
     FROM merchant_matching_settings
     WHERE org_id = $1`,
    [orgId],
  );
  return rows[0] ?? null;
}

/**
 * Effective mode for order create (Mode B when unset).
 * @param {string} orgId
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function getEffectiveMatchingMode(orgId, client) {
  const row = await findMatchingModeSettings(orgId, client);
  return row?.matching_mode ?? DEFAULT_MATCHING_MODE;
}

/**
 * @param {{ orgId: string, matchingMode: string }} input
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function upsertMatchingModeSettings(input, client) {
  const { rows } = await db(client).query(
    `INSERT INTO merchant_matching_settings (org_id, matching_mode)
     VALUES ($1, $2)
     ON CONFLICT (org_id)
     DO UPDATE SET matching_mode = EXCLUDED.matching_mode, updated_at = now()
     RETURNING org_id, matching_mode`,
    [input.orgId, input.matchingMode],
  );
  return rows[0];
}
