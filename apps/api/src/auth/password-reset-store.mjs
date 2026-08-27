import { randomBytes } from "node:crypto";
import { getPool } from "../db/pool.mjs";
import { hashSessionToken } from "./session-token.mjs";

const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * @param {string} userId
 * @returns {Promise<string>} raw token (deliver out-of-band; never log in production)
 */
export async function createPasswordResetToken(userId) {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(raw);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  const pool = getPool();
  await pool.query(
    `UPDATE password_reset_tokens
     SET used_at = now()
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId],
  );
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
