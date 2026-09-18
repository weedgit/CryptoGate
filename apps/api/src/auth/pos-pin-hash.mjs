import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/**
 * @param {string} pin
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function validatePosPin(pin) {
  if (typeof pin !== "string" || !/^\d{4,8}$/.test(pin)) {
    return {
      ok: false,
      code: "pos_pin_invalid",
      message: "POS PIN must be 4–8 digits",
    };
  }
  return { ok: true };
}

/**
 * Format: scrypt$N$r$p$saltB64$hashB64 (same envelope as passwords).
 * @param {string} pin
 * @returns {Promise<string>}
 */
export async function hashPosPin(pin) {
  const check = validatePosPin(pin);
  if (!check.ok) {
    const err = new Error(check.message);
    err.code = check.code;
    throw err;
  }
  const salt = randomBytes(16);
  const derived = /** @type {Buffer} */ (
    await scryptAsync(pin, salt, KEYLEN, SCRYPT_OPTS)
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
 * @param {string} pin
 * @param {string} encoded
 * @returns {Promise<boolean>}
 */
export async function verifyPosPin(pin, encoded) {
  if (typeof pin !== "string" || typeof encoded !== "string") return false;
  if (!validatePosPin(pin).ok) return false;
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  if (salt.length === 0 || expected.length === 0) return false;
  const derived = /** @type {Buffer} */ (
    await scryptAsync(pin, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    })
  );
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
