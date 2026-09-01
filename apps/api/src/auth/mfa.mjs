import { getPool } from "../db/pool.mjs";

/**
 * @param {string} userId
 * @param {string} pendingSecret
 */
export async function setPendingMfaSecret(userId, pendingSecret) {
  const pool = getPool();
  await pool.query(
    `UPDATE users
     SET mfa_pending_secret = $2,
         updated_at = now()
     WHERE id = $1`,
    [userId, pendingSecret],
  );
}

/**
 * Complete enroll: pending secret becomes the enrolled secret.
 * @param {string} userId
 */
export async function activatePendingMfa(userId) {
  const pool = getPool();
  await pool.query(
    `UPDATE users
     SET mfa_secret = mfa_pending_secret,
         mfa_pending_secret = NULL,
         mfa_enrolled_at = now(),
         updated_at = now()
     WHERE id = $1
       AND mfa_pending_secret IS NOT NULL`,
    [userId],
  );
}

/** Clear enrolled/pending MFA so the user can set up a new authenticator. */
export async function clearUserMfa(userId) {
  const pool = getPool();
  await pool.query(
    `UPDATE users
     SET mfa_secret = NULL,
         mfa_pending_secret = NULL,
         mfa_enrolled_at = NULL,
         updated_at = now()
     WHERE id = $1`,
    [userId],
  );
}
