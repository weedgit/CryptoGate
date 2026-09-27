import { getPool } from "../db/pool.mjs";

/** Waiver tables arrive with migration 078; before that, behave as empty lists. */
function isMissingTable(err) {
  return Boolean(err && err.code === "42P01");
}

/**
 * @param {string} sql
 * @param {unknown[]} params
 * @param {object[]} [fallbackRows]
 */
async function queryWaivers(sql, params, fallbackRows = []) {
  try {
    return await getPool().query(sql, params);
  } catch (err) {
    if (isMissingTable(err)) return { rows: fallbackRows, rowCount: 0 };
    throw err;
  }
}

export async function listFeeWaivers() {
  const { rows } = await queryWaivers(
    `SELECT w.org_id, o.name AS org_name, w.months_granted, w.months_used,
            w.reason, w.created_at, w.updated_at
     FROM billing_fee_waivers w
     JOIN org_accounts o ON o.id = w.org_id
     ORDER BY lower(o.name), w.org_id`,
    [],
  );
  return rows;
}

export async function listActivationWaivers() {
  const { rows } = await queryWaivers(
    `SELECT w.org_id, o.name AS org_name, w.reason, w.created_at, w.updated_at
     FROM billing_activation_waivers w
     JOIN org_accounts o ON o.id = w.org_id
     ORDER BY lower(o.name), w.org_id`,
    [],
  );
  return rows;
}

/**
 * @param {string} orgId
 */
export async function findFeeWaiver(orgId) {
  const { rows } = await queryWaivers(
    `SELECT org_id, months_granted, months_used, reason, created_at, updated_at
     FROM billing_fee_waivers WHERE org_id = $1`,
    [orgId],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} orgId
 */
export async function findActivationWaiver(orgId) {
  const { rows } = await queryWaivers(
    `SELECT org_id, reason, created_at, updated_at
     FROM billing_activation_waivers WHERE org_id = $1`,
    [orgId],
  );
  return rows[0] ?? null;
}

/**
 * Waived months left + activation waiver flag for merchant detail / lists.
 * @param {string[]} orgIds
 * @returns {Promise<Map<string, { waivedMonthsLeft: number | null, activationWaived: boolean }>>}
 */
export async function waiverSummaryForOrgs(orgIds) {
  /** @type {Map<string, { waivedMonthsLeft: number | null, activationWaived: boolean }>} */
  const out = new Map();
  if (orgIds.length === 0) return out;
  const { rows } = await queryWaivers(
    `SELECT o.id AS org_id,
            (SELECT f.months_granted - f.months_used
             FROM billing_fee_waivers f WHERE f.org_id = o.id) AS months_left,
            EXISTS (SELECT 1 FROM billing_activation_waivers a
                    WHERE a.org_id = o.id) AS activation_waived
     FROM unnest($1::uuid[]) AS o(id)`,
    [orgIds],
  );
  for (const r of rows) {
    out.set(r.org_id, {
      waivedMonthsLeft: r.months_left == null ? null : Number(r.months_left),
      activationWaived: Boolean(r.activation_waived),
    });
  }
  return out;
}

/**
 * Add or edit: months left becomes `monthsLeft` (used months are kept for "N of M").
 * @param {{ orgId: string, monthsLeft: number, reason: string, createdBy?: string | null }} input
 */
export async function upsertFeeWaiver(input) {
  const { rows } = await getPool().query(
    `INSERT INTO billing_fee_waivers (org_id, months_granted, months_used, reason, created_by)
     VALUES ($1, $2, 0, $3, $4)
     ON CONFLICT (org_id) DO UPDATE
       SET months_granted = billing_fee_waivers.months_used + EXCLUDED.months_granted,
           reason = EXCLUDED.reason,
           updated_at = now()
     RETURNING org_id, months_granted, months_used, reason, created_at, updated_at`,
    [input.orgId, input.monthsLeft, input.reason, input.createdBy ?? null],
  );
  return rows[0];
}

/**
 * @param {{ orgId: string, reason: string, createdBy?: string | null }} input
 */
export async function upsertActivationWaiver(input) {
  const { rows } = await getPool().query(
    `INSERT INTO billing_activation_waivers (org_id, reason, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (org_id) DO UPDATE
       SET reason = EXCLUDED.reason, updated_at = now()
     RETURNING org_id, reason, created_at, updated_at`,
    [input.orgId, input.reason, input.createdBy ?? null],
  );
  return rows[0];
}

/**
 * @param {string} orgId
 */
export async function deleteFeeWaiver(orgId) {
  const { rowCount } = await queryWaivers(
    `DELETE FROM billing_fee_waivers WHERE org_id = $1`,
    [orgId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * @param {string} orgId
 */
export async function deleteActivationWaiver(orgId) {
  const { rowCount } = await queryWaivers(
    `DELETE FROM billing_activation_waivers WHERE org_id = $1`,
    [orgId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * One waived month used: count down, and drop the entry when it reaches 0.
 * @param {string} orgId
 */
export async function consumeFeeWaiverMonth(orgId) {
  await queryWaivers(
    `DELETE FROM billing_fee_waivers
     WHERE org_id = $1 AND months_used + 1 >= months_granted`,
    [orgId],
  );
  await queryWaivers(
    `UPDATE billing_fee_waivers
     SET months_used = months_used + 1, updated_at = now()
     WHERE org_id = $1 AND months_used + 1 < months_granted`,
    [orgId],
  );
}
