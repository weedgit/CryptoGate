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
    `SELECT id, email, password_hash
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
  return { id: user.id, email: user.email };
}
