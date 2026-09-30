import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Generated PINs are 6 digits; verification accepts 6–8 so longer PINs can come later. */
export const GENERATED_POS_PIN_LENGTH = 6;
const MIN_PEPPER_BYTES = 32;

/**
 * @param {string} pin
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function validatePosPin(pin) {
  if (typeof pin !== "string" || !/^\d{6,8}$/.test(pin)) {
    return {
      ok: false,
      code: "pos_pin_invalid",
      message: "POS PIN must be 6–8 digits",
    };
  }
  return { ok: true };
}

export function generatePosPin() {
  return String(randomInt(0, 10 ** GENERATED_POS_PIN_LENGTH)).padStart(
    GENERATED_POS_PIN_LENGTH,
    "0",
  );
}

/** @returns {string | null} */
function posPinPepper() {
  const raw = process.env.POS_PIN_PEPPER;
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return Buffer.byteLength(value, "utf8") >= MIN_PEPPER_BYTES ? value : null;
}

/** API start-up guard: PIN-only unlock cannot work without the lookup secret. */
export function assertPosPinPepperEnv() {
  if (!posPinPepper()) {
    throw new Error(
      `POS_PIN_PEPPER must be set to a random value of at least ${MIN_PEPPER_BYTES} bytes (base64url; plain hex is refused as a possible private key)`,
    );
  }
}

/**
 * Searchable PIN key, unique within the org: HMAC-SHA256(pepper, orgId + ":" + pin).
 * Changing the pepper invalidates every PIN (they must all be generated again).
 * @param {string} orgId
 * @param {string} pin
 */
export function posPinLookup(orgId, pin) {
  const pepper = posPinPepper();
  if (!pepper) {
    const err = new Error("POS_PIN_PEPPER is not configured");
    err.code = "pos_pin_pepper_missing";
    throw err;
  }
  return createHmac("sha256", pepper).update(`${orgId}:${pin}`, "utf8").digest("hex");
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
