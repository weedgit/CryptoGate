import { randomBytes } from "node:crypto";
import { getPool } from "../db/pool.mjs";
import { hashSessionToken } from "./session-token.mjs";

const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * New links do not void older unused ones: anyone who knows an address could otherwise kill
 * that person's invite link by asking for a reset (review M19). A completed reset voids them
 * all (voidPasswordResetTokensForUser).
 * @param {string} userId
 * @returns {Promise<string>} raw token (deliver out-of-band; never log in production)
 */
export async function createPasswordResetToken(userId) {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(raw);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  const pool = getPool();
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt.toISOString()],
  );
  return raw;
}

/**
 * @param {string} rawToken
 * @returns {Promise<{ userId: string } | null>}
 */
export async function findValidPasswordReset(rawToken) {
  if (typeof rawToken !== "string" || rawToken.length < 16) {
    return null;
  }
  const tokenHash = hashSessionToken(rawToken);
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT user_id
     FROM password_reset_tokens
     WHERE token_hash = $1
       AND used_at IS NULL
       AND expires_at > now()`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return { userId: row.user_id };
}

/**
 * Spend a reset token once: of two concurrent requests with the same token, only one gets
 * the user id back.
 * @param {string} rawToken
 * @returns {Promise<{ userId: string } | null>}
 */
export async function consumePasswordResetToken(rawToken) {
  if (typeof rawToken !== "string" || rawToken.length < 16) return null;
  const { rows } = await getPool().query(
    `UPDATE password_reset_tokens
     SET used_at = now()
     WHERE token_hash = $1
       AND used_at IS NULL
       AND expires_at > now()
     RETURNING user_id`,
    [hashSessionToken(rawToken)],
  );
  return rows[0] ? { userId: rows[0].user_id } : null;
}

/**
 * Void every outstanding reset / invite link of a user (after a completed reset).
 * @param {string} userId
 */
export async function voidPasswordResetTokensForUser(userId) {
  await getPool().query(
    `UPDATE password_reset_tokens
     SET used_at = now()
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId],
  );
}

/**
 * Reset links issued to a user in the last `minutes` (caps reset-mail floods).
 * @param {string} userId
 * @param {number} minutes
 */
export async function countRecentPasswordResetTokens(userId, minutes) {
  const { rows } = await getPool().query(
    `SELECT count(*)::int AS n FROM password_reset_tokens
     WHERE user_id = $1 AND created_at > now() - make_interval(mins => $2)`,
    [userId, minutes],
  );
  return rows[0]?.n ?? 0;
}

/**
 * @param {string} rawToken
 */
export async function markPasswordResetUsed(rawToken) {
  const tokenHash = hashSessionToken(rawToken);
  const pool = getPool();
  await pool.query(
    `UPDATE password_reset_tokens
     SET used_at = now()
     WHERE token_hash = $1`,
    [tokenHash],
  );
}
