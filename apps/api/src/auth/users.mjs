import { getPool } from "../db/pool.mjs";
import { hashPassword, verifyPassword } from "./password-hash.mjs";
import { validatePassword } from "./password-policy.mjs";

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
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email`,
      [email, passwordHash],
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
    `SELECT id, email, password_hash, mfa_enrolled_at
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
  };
}

/**
 * @param {string} id
 * @returns {Promise<{ id: string, email: string, mfaEnrolled: boolean } | null>}
 */
export async function findUserById(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, email, mfa_enrolled_at
     FROM users
     WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    mfaEnrolled: Boolean(row.mfa_enrolled_at),
  };
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
  return { id: user.id, email: user.email, mfaEnrolled: user.mfaEnrolled };
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
     SET password_hash = $2, updated_at = now()
     WHERE id = $1`,
    [userId, passwordHash],
  );
}
