import { getPool } from "../db/pool.mjs";
import {
  DEFAULT_MATCHING_MODE,
  DEFAULT_UNDERPAY_TOLERANCE,
} from "./matching-mode-rules.mjs";

/**
 * @param {import("pg").Pool | import("pg").PoolClient | null | undefined} client
 */
function db(client) {
  return client ?? getPool();
}

/**
 * @param {string} orgId
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 * @returns {Promise<{ org_id: string, matching_mode: string, underpay_tolerance: string } | null>}
 */
export async function findMatchingModeSettings(orgId, client) {
  const { rows } = await db(client).query(
    `SELECT org_id, matching_mode, underpay_tolerance
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
 * @param {string} orgId
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function getEffectiveUnderpayTolerance(orgId, client) {
  const row = await findMatchingModeSettings(orgId, client);
  return row?.underpay_tolerance ?? DEFAULT_UNDERPAY_TOLERANCE;
}

/**
 * @param {{ orgId: string, matchingMode: string, underpayTolerance?: string }} input
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function upsertMatchingModeSettings(input, client) {
  const tol = input.underpayTolerance ?? DEFAULT_UNDERPAY_TOLERANCE;
  const { rows } = await db(client).query(
    `INSERT INTO merchant_matching_settings (org_id, matching_mode, underpay_tolerance)
     VALUES ($1, $2, $3)
     ON CONFLICT (org_id)
     DO UPDATE SET
       matching_mode = EXCLUDED.matching_mode,
       underpay_tolerance = EXCLUDED.underpay_tolerance,
       updated_at = now()
     RETURNING org_id, matching_mode, underpay_tolerance`,
    [input.orgId, input.matchingMode, tol],
  );
  return rows[0];
}
