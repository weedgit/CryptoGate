import { randomBytes } from "node:crypto";
import { getPool } from "../db/pool.mjs";
import { hashSessionToken } from "./session-token.mjs";

export { hashSessionToken };

export const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {{ userId: string, ttlMs?: number, mfaVerified?: boolean }} input
 * @returns {Promise<{ token: string, sessionId: string, expiresAt: Date }>}
 */
export async function createSession(input) {
  const ttlMs = input.ttlMs ?? DEFAULT_SESSION_TTL_MS;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + ttlMs);
  const mfaVerifiedAt = input.mfaVerified ? new Date().toISOString() : null;
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, mfa_verified_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [input.userId, tokenHash, expiresAt.toISOString(), mfaVerifiedAt],
  );
  return {
    token,
    sessionId: rows[0].id,
    expiresAt,
  };
}

/**
 * @param {string} token
 * @returns {Promise<{ sessionId: string, userId: string, mfaVerified: boolean } | null>}
 */
export async function findActiveSessionByToken(token) {
  const tokenHash = hashSessionToken(token);
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, user_id, mfa_verified_at
     FROM sessions
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > now()`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: row.id,
    userId: row.user_id,
    mfaVerified: row.mfa_verified_at != null,
  };
}

/**
 * Mark MFA step-up or enrollment verify complete for this session.
 * @param {string} token
 */
export async function markSessionMfaVerified(token) {
  const tokenHash = hashSessionToken(token);
  const pool = getPool();
  await pool.query(
    `UPDATE sessions
     SET mfa_verified_at = now()
     WHERE token_hash = $1
       AND revoked_at IS NULL`,
    [tokenHash],
  );
}

/**
 * Extend an active session (UI “Stay signed in” / GET /auth/session).
 * @param {string} token
 * @param {{ ttlMs?: number }} [opts]
 * @returns {Promise<Date | null>}
 */
export async function extendSessionByToken(token, opts = {}) {
  const ttlMs = opts.ttlMs ?? DEFAULT_SESSION_TTL_MS;
  const expiresAt = new Date(Date.now() + ttlMs);
  const tokenHash = hashSessionToken(token);
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE sessions
     SET expires_at = $2
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > now()`,
    [tokenHash, expiresAt.toISOString()],
  );
  if ((rowCount ?? 0) === 0) return null;
  return expiresAt;
}

/**
 * @param {string} token
 * @returns {Promise<boolean>} true if a row was revoked
 */
export async function revokeSessionByToken(token) {
  const tokenHash = hashSessionToken(token);
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE sessions
     SET revoked_at = now()
     WHERE token_hash = $1
       AND revoked_at IS NULL`,
    [tokenHash],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Revoke every active session for a user (logout-all / security).
 * @param {string} userId
 */
export async function revokeAllSessionsForUser(userId) {
  const pool = getPool();
  await pool.query(
    `UPDATE sessions
     SET revoked_at = now()
     WHERE user_id = $1
       AND revoked_at IS NULL`,
    [userId],
  );
}
