import { getPool } from "../db/pool.mjs";
import { DEFAULT_MATCHING_MODE } from "./matching-mode-rules.mjs";

/**
 * @param {string} orgId
 * @returns {Promise<{ org_id: string, matching_mode: string } | null>}
 */
export async function findMatchingModeSettings(orgId) {
  const pool = getPool();
  const { rows } = await pool.query(
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
 */
export async function getEffectiveMatchingMode(orgId) {
  const row = await findMatchingModeSettings(orgId);
  return row?.matching_mode ?? DEFAULT_MATCHING_MODE;
}

/**
 * @param {{ orgId: string, matchingMode: string }} input
 */
export async function upsertMatchingModeSettings(input) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO merchant_matching_settings (org_id, matching_mode)
     VALUES ($1, $2)
     ON CONFLICT (org_id)
     DO UPDATE SET matching_mode = EXCLUDED.matching_mode, updated_at = now()
     RETURNING org_id, matching_mode`,
    [input.orgId, input.matchingMode],
  );
  return rows[0];
}
