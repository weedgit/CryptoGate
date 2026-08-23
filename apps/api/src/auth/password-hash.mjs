import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { validatePassword } from "./password-policy.mjs";

const scryptAsync = promisify(scrypt);

/** scrypt params — fixed for stored hashes; do not change lightly. */
const KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/**
 * Format: scrypt$N$r$p$saltB64$hashB64
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  const check = validatePassword(password);
  if (!check.ok) {
    const err = new Error(check.message);
    err.code = check.code;
    throw err;
  }
  const salt = randomBytes(16);
  const derived = /** @type {Buffer} */ (
    await scryptAsync(password, salt, KEYLEN, SCRYPT_OPTS)
  );
  return [
    "scrypt",
    String(SCRYPT_OPTS.N),
    String(SCRYPT_OPTS.r),
    String(SCRYPT_OPTS.p),
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * @param {string} password
 * @param {string} encoded
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || typeof encoded !== "string") {
    return false;
  }
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = /** @type {Buffer} */ (
    await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    })
  );
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
