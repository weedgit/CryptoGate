import { getPool } from "../db/pool.mjs";

const SELECT = `
  id, site_org_id, parent_org_id, setting_kind, status, payload,
  requested_by, decided_by, decided_at, created_at, updated_at
`;

/**
 * @param {import("pg").Pool | import("pg").PoolClient | null | undefined} client
 */
function db(client) {
  return client ?? getPool();
}

/**
 * @param {string} siteOrgId
 * @param {string} kind
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function hasApprovedOverride(siteOrgId, kind, client) {
  const { rows } = await db(client).query(
    `SELECT 1
     FROM site_setting_overrides
     WHERE site_org_id = $1 AND setting_kind = $2 AND status = 'approved'
     LIMIT 1`,
    [siteOrgId, kind],
  );
  return rows.length > 0;
}

/**
 * @param {string} siteOrgId
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function listOverridesForSite(siteOrgId, client) {
  const { rows } = await db(client).query(
    `SELECT ${SELECT}
     FROM site_setting_overrides
     WHERE site_org_id = $1
     ORDER BY created_at DESC`,
    [siteOrgId],
  );
  return rows;
}

/**
 * @param {string} id
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function findOverrideById(id, client) {
  const { rows } = await db(client).query(
    `SELECT ${SELECT}
     FROM site_setting_overrides
     WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * @param {{
 *   siteOrgId: string,
 *   parentOrgId: string,
 *   settingKind: string,
 *   payload: object,
 *   requestedBy: string,
 * }} input
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function insertPendingOverride(input, client) {
  const { rows } = await db(client).query(
    `INSERT INTO site_setting_overrides (
       site_org_id, parent_org_id, setting_kind, status, payload, requested_by
     ) VALUES ($1, $2, $3, 'pending', $4::jsonb, $5)
     RETURNING ${SELECT}`,
    [
      input.siteOrgId,
      input.parentOrgId,
      input.settingKind,
      JSON.stringify(input.payload),
      input.requestedBy,
    ],
  );
  return rows[0];
}

/**
 * @param {string} id
 * @param {{ status: string, decidedBy: string }} input
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function decideOverride(id, input, client) {
  const { rows } = await db(client).query(
    `UPDATE site_setting_overrides
     SET status = $2,
         decided_by = $3,
         decided_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING ${SELECT}`,
    [id, input.status, input.decidedBy],
  );
  return rows[0] ?? null;
}

/**
 * Platform compliance PUT on a site: grant the kind so order create uses site rows.
 * @param {{
 *   siteOrgId: string,
 *   parentOrgId: string,
 *   settingKind: string,
 *   actorUserId: string,
 * }} input
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function ensureApprovedOverride(input, client) {
  if (await hasApprovedOverride(input.siteOrgId, input.settingKind, client)) {
    return;
  }
  try {
    await db(client).query(
      `INSERT INTO site_setting_overrides (
         site_org_id, parent_org_id, setting_kind, status, payload, requested_by,
         decided_by, decided_at
       ) VALUES ($1, $2, $3, 'approved', '{}'::jsonb, $4, $4, now())`,
      [input.siteOrgId, input.parentOrgId, input.settingKind, input.actorUserId],
    );
  } catch (err) {
    if (err && err.code === "23505") return;
    throw err;
  }
}
