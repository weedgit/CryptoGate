import { getPool } from "../db/pool.mjs";
import { isMaintenanceEffective } from "./network-maintenance-rules.mjs";

/**
 * @param {Record<string, unknown>} row
 */
function mapRow(row) {
  return {
    network: String(row.network),
    active: Boolean(row.active),
    message: row.message == null ? null : String(row.message),
    startedAt:
      row.started_at == null
        ? null
        : row.started_at instanceof Date
          ? row.started_at.toISOString()
          : String(row.started_at),
    endsAt:
      row.ends_at == null
        ? null
        : row.ends_at instanceof Date
          ? row.ends_at.toISOString()
          : String(row.ends_at),
    updatedByUserId:
      row.updated_by_user_id == null ? null : String(row.updated_by_user_id),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

/**
 * @returns {Promise<ReturnType<typeof mapRow>[]>}
 */
export async function listNetworkMaintenanceRows() {
  const { rows } = await getPool().query(
    `SELECT network, active, message, started_at, ends_at,
            updated_by_user_id, updated_at
     FROM network_maintenance
     ORDER BY network ASC`,
  );
  return rows.map(mapRow);
}

/**
 * @param {string} network
 * @returns {Promise<ReturnType<typeof mapRow> | null>}
 */
export async function getNetworkMaintenance(network) {
  const { rows } = await getPool().query(
    `SELECT network, active, message, started_at, ends_at,
            updated_by_user_id, updated_at
     FROM network_maintenance
     WHERE network = $1`,
    [network],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * @param {string} network
 * @returns {Promise<{ active: boolean, message: string | null, endsAt: string | null } | null>}
 */
export async function getEffectiveNetworkMaintenance(network) {
  const row = await getNetworkMaintenance(network);
  if (!isMaintenanceEffective(row)) return null;
  return {
    active: true,
    message: row.message,
    endsAt: row.endsAt,
  };
}

/**
 * Active windows only (for merchant / agent banners).
 * @returns {Promise<ReturnType<typeof mapRow>[]>}
 */
export async function listActiveNetworkMaintenance() {
  const rows = await listNetworkMaintenanceRows();
  return rows.filter((row) => isMaintenanceEffective(row));
}

/**
 * @param {{
 *   network: string,
 *   active: boolean,
 *   message: string | null,
 *   endsAt: string | null,
 *   updatedByUserId: string | null,
 * }} input
 */
export async function upsertNetworkMaintenance(input) {
  const startedAt = input.active ? new Date().toISOString() : null;
  const { rows } = await getPool().query(
    `INSERT INTO network_maintenance (
       network, active, message, started_at, ends_at, updated_by_user_id, updated_at
     ) VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6::uuid, now())
     ON CONFLICT (network) DO UPDATE SET
       active = EXCLUDED.active,
       message = EXCLUDED.message,
       started_at = CASE
         WHEN EXCLUDED.active AND NOT network_maintenance.active THEN EXCLUDED.started_at
         WHEN EXCLUDED.active THEN COALESCE(network_maintenance.started_at, EXCLUDED.started_at)
         ELSE NULL
       END,
       ends_at = EXCLUDED.ends_at,
       updated_by_user_id = EXCLUDED.updated_by_user_id,
       updated_at = now()
     RETURNING network, active, message, started_at, ends_at,
               updated_by_user_id, updated_at`,
    [
      input.network,
      input.active,
      input.message,
      startedAt,
      input.endsAt,
      input.updatedByUserId,
    ],
  );
  return mapRow(rows[0]);
}
