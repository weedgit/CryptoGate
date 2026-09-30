import { randomBytes } from "node:crypto";
import { getPool } from "../db/pool.mjs";
import { hashSessionToken } from "../auth/session-token.mjs";

export const TERMINAL_TOKEN_PREFIX = "pgt_";
/** Wrong PINs in a row before the terminal locks. */
export const UNLOCK_FAILURES_PER_LOCKOUT = 5;
export const UNLOCK_LOCKOUT_BASE_SECONDS = 30;
export const UNLOCK_LOCKOUT_MAX_SECONDS = 15 * 60;

const TERMINAL_COLUMNS = `t.id, t.org_id, t.status, t.device_model, t.app_version,
  t.last_seen_at, t.created_at, t.bound_by, t.revoked_at, t.revoke_reason,
  t.locked_until, o.name AS org_name, o.type AS org_type,
  b.email AS bound_by_email, b.first_name AS bound_by_first_name, b.last_name AS bound_by_last_name`;

const TERMINAL_FROM = `pos_terminals t
     JOIN org_accounts o ON o.id = t.org_id
     LEFT JOIN users b ON b.id = t.bound_by`;

/**
 * @param {Record<string, any>} row
 */
function mapTerminal(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    orgName: row.org_name ?? null,
    orgType: row.org_type ?? null,
    status: row.status,
    deviceModel: row.device_model ?? null,
    appVersion: row.app_version ?? null,
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    boundBy: row.bound_by ?? null,
    boundByEmail: row.bound_by_email ?? null,
    boundByName:
      [row.bound_by_first_name, row.bound_by_last_name].filter(Boolean).join(" ").trim() || null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    revokeReason: row.revoke_reason ?? null,
    lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
  };
}

/**
 * @param {{ orgId: string, boundBy: string, deviceModel: string | null, appVersion: string | null, ip: string | null }} input
 * @returns {Promise<{ token: string, terminalId: string }>}
 */
export async function insertTerminal(input) {
  const token = `${TERMINAL_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const { rows } = await getPool().query(
    `INSERT INTO pos_terminals (org_id, token_hash, device_model, app_version, bound_by, last_seen_at, last_ip)
     VALUES ($1, $2, $3, $4, $5, now(), $6::inet)
     RETURNING id`,
    [
      input.orgId,
      hashSessionToken(token),
      input.deviceModel,
      input.appVersion,
      input.boundBy,
      safeInet(input.ip),
    ],
  );
  return { token, terminalId: rows[0].id };
}

/**
 * @param {string | null} ip
 */
function safeInet(ip) {
  if (!ip || ip === "unknown") return null;
  const value = ip.replace(/^::ffff:/, "");
  return /^[0-9a-fA-F:.]+$/.test(value) ? value : null;
}

/**
 * @param {string} token raw terminal token
 */
export async function findTerminalByToken(token) {
  const { rows } = await getPool().query(
    `SELECT ${TERMINAL_COLUMNS}
     FROM ${TERMINAL_FROM}
     WHERE t.token_hash = $1`,
    [hashSessionToken(token)],
  );
  return rows[0] ? mapTerminal(rows[0]) : null;
}

/**
 * @param {string} orgId
 * @param {string} terminalId
 */
export async function findTerminalInOrg(orgId, terminalId) {
  const { rows } = await getPool().query(
    `SELECT ${TERMINAL_COLUMNS}
     FROM ${TERMINAL_FROM}
     WHERE t.org_id = $1 AND t.id = $2`,
    [orgId, terminalId],
  );
  return rows[0] ? mapTerminal(rows[0]) : null;
}

/**
 * @param {string} orgId
 */
export async function listTerminalsForOrg(orgId) {
  const { rows } = await getPool().query(
    `SELECT ${TERMINAL_COLUMNS}
     FROM ${TERMINAL_FROM}
     WHERE t.org_id = $1
     ORDER BY t.status = 'active' DESC, t.created_at DESC`,
    [orgId],
  );
  return rows.map(mapTerminal);
}

/**
 * @param {string} terminalId
 * @param {string | null} ip
 */
export async function touchTerminal(terminalId, ip) {
  await getPool().query(
    `UPDATE pos_terminals SET last_seen_at = now(), last_ip = COALESCE($2::inet, last_ip)
     WHERE id = $1`,
    [terminalId, safeInet(ip)],
  );
}

/**
 * @param {string} terminalId
 * @param {{ revokedBy: string | null, reason: string }} input
 * @returns {Promise<boolean>} true when it was still active
 */
export async function revokeTerminal(terminalId, input) {
  const { rowCount } = await getPool().query(
    `UPDATE pos_terminals
     SET status = 'revoked', revoked_at = now(), revoked_by = $2, revoke_reason = $3
     WHERE id = $1 AND status = 'active'`,
    [terminalId, input.revokedBy, input.reason],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Count one wrong PIN. Every 5th in a row locks the terminal for 30 s, doubling per
 * lockout up to 15 min.
 * @param {string} terminalId
 * @returns {Promise<{ lockedUntil: Date | null }>}
 */
export async function recordUnlockFailure(terminalId) {
  const { rows } = await getPool().query(
    `UPDATE pos_terminals
     SET failed_unlocks = CASE WHEN failed_unlocks + 1 >= $2 THEN 0 ELSE failed_unlocks + 1 END,
         lockout_level = CASE WHEN failed_unlocks + 1 >= $2 THEN lockout_level + 1 ELSE lockout_level END,
         locked_until = CASE
           WHEN failed_unlocks + 1 >= $2
             THEN now() + make_interval(secs => LEAST($3 * power(2, LEAST(lockout_level, 10)), $4))
           ELSE locked_until
         END
     WHERE id = $1
     RETURNING locked_until`,
    [
      terminalId,
      UNLOCK_FAILURES_PER_LOCKOUT,
      UNLOCK_LOCKOUT_BASE_SECONDS,
      UNLOCK_LOCKOUT_MAX_SECONDS,
    ],
  );
  const until = rows[0]?.locked_until;
  return { lockedUntil: until ? new Date(until) : null };
}

/**
 * @param {string} terminalId
 */
export async function resetUnlockFailures(terminalId) {
  await getPool().query(
    `UPDATE pos_terminals SET failed_unlocks = 0, lockout_level = 0, locked_until = NULL
     WHERE id = $1`,
    [terminalId],
  );
}

/**
 * Wrong PINs across every terminal of the org in the last hour (from the audit log).
 * @param {string} orgId
 */
export async function countRecentFailedUnlocks(orgId) {
  const { rows } = await getPool().query(
    `SELECT count(*)::int AS n FROM audit_log
     WHERE org_id = $1 AND action = 'pos_unlock_failed'
       AND created_at > now() - interval '1 hour'`,
    [orgId],
  );
  return rows[0]?.n ?? 0;
}
