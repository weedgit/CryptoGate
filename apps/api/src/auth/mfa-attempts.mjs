/**
 * TOTP verification with a per-account failure limit and single-use codes (review H8).
 * Every place that accepts a TOTP code goes through verifyUserTotp.
 */
import { getPool } from "../db/pool.mjs";
import { sendError } from "../http/json.mjs";
import { totpMatchStep } from "./totp.mjs";

/** Wrong codes in a row before the account's TOTP checks lock. */
export const MFA_MAX_FAILURES = 5;
/** Lock length once MFA_MAX_FAILURES is reached. */
export const MFA_LOCKOUT_MS = 15 * 60 * 1000;

const INVALID_MFA = "Invalid MFA code";

/**
 * @param {string} userId
 * @param {string | null | undefined} secretBase32
 * @param {unknown} code
 * @param {{ nowMs?: number }} [opts]
 * @returns {Promise<{ ok: true } | { ok: false, code: "invalid_mfa" | "mfa_locked", retryAfterSec?: number }>}
 */
export async function verifyUserTotp(userId, secretBase32, code, opts = {}) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM (mfa_locked_until - now()))))::int AS locked_sec
     FROM users WHERE id = $1`,
    [userId],
  );
  const lockedSec = rows[0]?.locked_sec ?? 0;
  if (lockedSec > 0) return { ok: false, code: "mfa_locked", retryAfterSec: lockedSec };

  const step = secretBase32 ? totpMatchStep(secretBase32, String(code ?? ""), opts) : null;
  if (step !== null) {
    // Accept only a step newer than the last accepted one (a seen code cannot be replayed).
    const { rowCount } = await pool.query(
      `UPDATE users
       SET mfa_last_step = $2, mfa_failed_count = 0, mfa_locked_until = NULL
       WHERE id = $1
         AND (mfa_last_step IS NULL OR mfa_last_step < $2)
         AND (mfa_locked_until IS NULL OR mfa_locked_until <= now())`,
      [userId, step],
    );
    if ((rowCount ?? 0) > 0) return { ok: true };
  }

  const { rows: failed } = await pool.query(
    `UPDATE users
     SET mfa_failed_count = CASE WHEN mfa_failed_count + 1 >= $2 THEN 0 ELSE mfa_failed_count + 1 END,
         mfa_locked_until = CASE
           WHEN mfa_failed_count + 1 >= $2 THEN now() + make_interval(secs => $3)
           ELSE mfa_locked_until
         END
     WHERE id = $1
     RETURNING GREATEST(0, CEIL(EXTRACT(EPOCH FROM (mfa_locked_until - now()))))::int AS locked_sec`,
    [userId, MFA_MAX_FAILURES, MFA_LOCKOUT_MS / 1000],
  );
  const nowLocked = failed[0]?.locked_sec ?? 0;
  if (nowLocked > 0) return { ok: false, code: "mfa_locked", retryAfterSec: nowLocked };
  return { ok: false, code: "invalid_mfa" };
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {{ code: string, retryAfterSec?: number }} result
 */
export function sendMfaFailure(res, result) {
  if (result.code === "mfa_locked") {
    res.setHeader("Retry-After", String(result.retryAfterSec ?? MFA_LOCKOUT_MS / 1000));
    sendError(
      res,
      429,
      "mfa_locked",
      "Too many wrong MFA codes. Try again in a few minutes.",
    );
    return;
  }
  sendError(res, 401, "invalid_mfa", INVALID_MFA);
}
