import { randomInt } from "node:crypto";
import { getPool } from "../db/pool.mjs";
import { hashSessionToken } from "./session-token.mjs";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 45 * 1000;
const OTP_MAX_ATTEMPTS = 8;

export const E164_PHONE_RE = /^\+[1-9]\d{7,14}$/;

/**
 * @param {unknown} value
 */
export function normalizePhone(value) {
  const raw = typeof value === "string" ? value.trim().replace(/[\s()-]/g, "") : "";
  if (!E164_PHONE_RE.test(raw)) return null;
  return raw;
}

function sixDigitCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * @param {string} userId
 * @param {"email" | "phone"} channel
 */
export async function latestActiveOtp(userId, channel) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, destination, expires_at, created_at, attempt_count, consumed_at
     FROM contact_otps
     WHERE user_id = $1 AND channel = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, channel],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} userId
 * @param {"email" | "phone"} channel
 * @param {string} destination
 * @returns {Promise<{ code: string, expiresAt: Date, resentTooSoon?: boolean, retryAfterSec?: number }>}
 */
export async function issueContactOtp(userId, channel, destination) {
  const latest = await latestActiveOtp(userId, channel);
  if (latest && !latest.consumed_at) {
    const created = new Date(latest.created_at).getTime();
    const wait = OTP_RESEND_MS - (Date.now() - created);
    if (wait > 0) {
      return {
        code: "",
        expiresAt: new Date(latest.expires_at),
        resentTooSoon: true,
        retryAfterSec: Math.max(1, Math.ceil(wait / 1000)),
      };
    }
  }

  const code = sixDigitCode();
  const codeHash = hashSessionToken(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const pool = getPool();
  await pool.query(
    `UPDATE contact_otps
     SET consumed_at = now()
     WHERE user_id = $1 AND channel = $2 AND consumed_at IS NULL`,
    [userId, channel],
  );
  await pool.query(
    `INSERT INTO contact_otps (user_id, channel, destination, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, channel, destination, codeHash, expiresAt.toISOString()],
  );
  return { code, expiresAt };
}

/**
 * @param {string} userId
 * @param {"email" | "phone"} channel
 * @param {string} code
 * @returns {Promise<"ok" | "invalid" | "expired" | "locked">}
 */
export async function consumeContactOtp(userId, channel, code) {
  const trimmed = typeof code === "string" ? code.trim() : "";
  if (!/^\d{6}$/.test(trimmed)) return "invalid";

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, code_hash, expires_at, consumed_at, attempt_count
     FROM contact_otps
     WHERE user_id = $1 AND channel = $2 AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, channel],
  );
  const row = rows[0];
  if (!row) return "expired";
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await pool.query(`UPDATE contact_otps SET consumed_at = now() WHERE id = $1`, [
      row.id,
    ]);
    return "expired";
  }
  if (Number(row.attempt_count) >= OTP_MAX_ATTEMPTS) {
    return "locked";
  }

  const ok = hashSessionToken(trimmed) === row.code_hash;
  if (!ok) {
    const { rows: updated } = await pool.query(
      `UPDATE contact_otps
       SET attempt_count = attempt_count + 1
       WHERE id = $1
       RETURNING attempt_count`,
      [row.id],
    );
    if (Number(updated[0]?.attempt_count) >= OTP_MAX_ATTEMPTS) {
      await pool.query(`UPDATE contact_otps SET consumed_at = now() WHERE id = $1`, [
        row.id,
      ]);
      return "locked";
    }
    return "invalid";
  }

  await pool.query(`UPDATE contact_otps SET consumed_at = now() WHERE id = $1`, [
    row.id,
  ]);
  return "ok";
}

export function echoOtpInHttp() {
  return process.env.NODE_ENV !== "production";
}
