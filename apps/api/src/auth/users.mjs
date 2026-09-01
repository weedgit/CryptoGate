import { getPool } from "../db/pool.mjs";
import { hashPassword, verifyPassword } from "./password-hash.mjs";
import { validatePassword } from "./password-policy.mjs";
import { normalizeSessionTimeoutMinutes } from "../http/session-ttl.mjs";

/**
 * Normalize email for storage and lookup (lower-case trim).
 * @param {string} email
 */
export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

/**
 * @param {{ email: string, password: string }} input
 * @returns {Promise<{ id: string, email: string }>}
 */
export async function createUser(input) {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    const err = new Error("Valid email is required");
    err.code = "email_invalid";
    throw err;
  }
  const policy = validatePassword(input.password);
  if (!policy.ok) {
    const err = new Error(policy.message);
    err.code = policy.code;
    throw err;
  }
  const passwordHash = await hashPassword(input.password);
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, session_timeout_minutes)
       VALUES ($1, $2, $3)
       RETURNING id, email`,
      [email, passwordHash, normalizeSessionTimeoutMinutes()],
    );
    return { id: rows[0].id, email: rows[0].email };
  } catch (err) {
    if (err && err.code === "23505") {
      const dup = new Error("Email already registered");
      dup.code = "email_taken";
      throw dup;
    }
    throw err;
  }
}

/**
 * @param {string} email
 * @returns {Promise<{ id: string, email: string, passwordHash: string } | null>}
 */
export async function findUserByEmail(email) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, mfa_enrolled_at, must_change_password
     FROM users
     WHERE email = $1`,
    [normalizeEmail(email)],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    mfaEnrolled: Boolean(row.mfa_enrolled_at),
    mustChangePassword: row.must_change_password === true,
  };
}

/**
 * @param {string} id
 * @returns {Promise<{ id: string, email: string, mfaEnrolled: boolean } | null>}
 */
export async function findUserById(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, email, mfa_enrolled_at, mfa_pending_secret, display_name, locale, timezone,
            mfa_enforcement, session_timeout_minutes, must_change_password
     FROM users
     WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return mapUserRow(row);
}

/**
 * @param {Record<string, unknown>} row
 */
function mapUserRow(row) {
  return {
    id: row.id,
    email: row.email,
    mfaEnrolled: Boolean(row.mfa_enrolled_at),
    mfaEnrollmentPending:
      Boolean(row.mfa_pending_secret) && row.mfa_enrolled_at == null,
    displayName: row.display_name ?? null,
    locale: row.locale || "en",
    timezone: row.timezone || "UTC",
    mfaEnforcement: Boolean(row.mfa_enforcement),
    sessionTimeoutMinutes: normalizeSessionTimeoutMinutes(
      row.session_timeout_minutes,
    ),
    mustChangePassword: row.must_change_password === true,
  };
}

/**
 * Update personal profile + security prefs. Email is not changed here.
 * @param {string} userId
 * @param {{
 *   displayName?: string | null,
 *   locale?: string,
 *   timezone?: string,
 *   mfaEnforcement?: boolean,
 *   sessionTimeoutMinutes?: number,
 * }} input
 */
export async function updateUserProfile(userId, input) {
  const current = await findUserById(userId);
  if (!current) return null;

  let displayName = current.displayName;
  if (input.displayName !== undefined) {
    const raw =
      input.displayName === null ? "" : String(input.displayName).trim();
    displayName = raw ? raw.slice(0, 120) : null;
  }
  const locale =
    typeof input.locale === "string" && input.locale.trim()
      ? input.locale.trim().slice(0, 32)
      : current.locale;
  const timezone =
    typeof input.timezone === "string" && input.timezone.trim()
      ? input.timezone.trim().slice(0, 64)
      : current.timezone;
  const mfaEnforcement =
    typeof input.mfaEnforcement === "boolean"
      ? input.mfaEnforcement
      : current.mfaEnforcement;
  const sessionTimeoutMinutes =
    typeof input.sessionTimeoutMinutes === "number"
      ? input.sessionTimeoutMinutes
      : current.sessionTimeoutMinutes;

  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE users
     SET display_name = $2,
         locale = $3,
         timezone = $4,
         mfa_enforcement = $5,
         session_timeout_minutes = $6,
         updated_at = now()
     WHERE id = $1
     RETURNING id, email, mfa_enrolled_at, display_name, locale, timezone,
               mfa_enforcement, session_timeout_minutes`,
    [
      userId,
      displayName,
      locale,
      timezone,
      mfaEnforcement,
      sessionTimeoutMinutes,
    ],
  );
  const row = rows[0];
  if (!row) return null;
  return mapUserRow(row);
}

/**
 * MFA secrets for enroll/verify only — never put these on HTTP session JSON.
 * @param {string} id
 * @returns {Promise<{ id: string, email: string, mfaSecret: string | null, mfaPendingSecret: string | null, mfaEnrolled: boolean } | null>}
 */
export async function findUserMfaById(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, email, mfa_secret, mfa_pending_secret, mfa_enrolled_at
     FROM users
     WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    mfaSecret: row.mfa_secret,
    mfaPendingSecret: row.mfa_pending_secret,
    mfaEnrolled: Boolean(row.mfa_enrolled_at),
  };
}

/** Lazy dummy hash so missing-user paths still run scrypt verify. */
let dummyHashPromise;

function getDummyPasswordHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword("timing-pad-password-12");
  }
  return dummyHashPromise;
}

/**
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ id: string, email: string } | null>}
 */
export async function authenticateUser(email, password) {
  const user = await findUserByEmail(email);
  const hash = user?.passwordHash ?? (await getDummyPasswordHash());
  const ok = await verifyPassword(password, hash);
  if (!user || !ok) return null;
  return {
    id: user.id,
    email: user.email,
    mfaEnrolled: user.mfaEnrolled,
    mustChangePassword: user.mustChangePassword === true,
  };
}

/**
 * @param {string} userId
 * @param {string} password
 */
export async function updateUserPassword(userId, password) {
  const policy = validatePassword(password);
  if (!policy.ok) {
    const err = new Error(policy.message);
    err.code = policy.code;
    throw err;
  }
  const passwordHash = await hashPassword(password);
  const pool = getPool();
  await pool.query(
    `UPDATE users
     SET password_hash = $2, must_change_password = false, updated_at = now()
     WHERE id = $1`,
    [userId, passwordHash],
  );
}
