import { getPool } from "../db/pool.mjs";

/**
 * @param {{
 *   orgId: string,
 *   actorUserId: string,
 *   overrideType: string,
 *   reasonCode: string,
 *   notes: string,
 *   ticketId: string | null,
 *   metadata?: Record<string, unknown>,
 * }} input
 */
export async function insertComplianceOverride(input) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO compliance_overrides (
       org_id, actor_user_id, override_type, reason_code, notes, ticket_id, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id, org_id, actor_user_id, override_type, reason_code, notes,
               ticket_id, metadata, created_at`,
    [
      input.orgId,
      input.actorUserId,
      input.overrideType,
      input.reasonCode,
      input.notes,
      input.ticketId,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return rows[0];
}

/**
 * @param {string} orgId
 * @param {{ limit?: number }} [opts]
 */
export async function listComplianceOverridesForOrg(orgId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT id, org_id, actor_user_id, override_type, reason_code, notes,
              ticket_id, metadata, created_at
       FROM compliance_overrides
       WHERE org_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [orgId, limit],
    );
    return { ok: true, rows };
  } catch (err) {
    if (err && (err.code === "42P01" || /compliance_overrides/i.test(String(err.message)))) {
      return { ok: true, rows: [], softEmpty: true };
    }
    throw err;
  }
}

/**
 * @param {string} orgId
 * @param {boolean} suspended
 */
export async function setOrderCreateSuspended(orgId, suspended) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE org_accounts
     SET order_create_suspended = $2, updated_at = now()
     WHERE id = $1
     RETURNING id, type, name, parent_id, structure, max_agent_depth, status,
               order_create_suspended, country, billing_email, legal_name, created_at`,
    [orgId, suspended === true],
  );
  return rows[0] ?? null;
}
