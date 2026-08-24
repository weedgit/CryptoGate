import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SEC = 30;
const DIGITS = 6;
const WINDOW = 1;

/**
 * @param {number} [byteLen]
 */
export function generateTotpSecret(byteLen = 20) {
  return encodeBase32(randomBytes(byteLen));
}

/**
 * @param {string} email
 * @param {string} secretBase32
 * @param {string} [issuer]
 */
export function otpauthUrl(email, secretBase32, issuer = "CryptoGate") {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SEC),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * @param {string} secretBase32
 * @param {string} code
 * @param {{ nowMs?: number }} [opts]
 */
export function verifyTotp(secretBase32, code, opts = {}) {
  const normalized = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6,8}$/.test(normalized)) return false;
  const six = normalized.slice(0, 6);
  const secret = decodeBase32(secretBase32);
  if (!secret) return false;
  const nowMs = opts.nowMs ?? Date.now();
  const counter = Math.floor(nowMs / 1000 / STEP_SEC);
  const expected = Buffer.from(six);
  for (let i = -WINDOW; i <= WINDOW; i++) {
    const candidate = Buffer.from(hotp(secret, counter + i));
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return true;
    }
  }
  return false;
}

/**
 * @param {Buffer} secret
 * @param {number} counter
 */
export function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = bin % 10 ** DIGITS;
  return String(otp).padStart(DIGITS, "0");
}

/**
 * @param {Buffer} bytes
 */
export function encodeBase32(bytes) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32[(value << (5 - bits)) & 31];
  }
  return out;
}

/**
 * @param {string} encoded
 * @returns {Buffer | null}
 */
export function decodeBase32(encoded) {
  const clean = encoded.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  if (!clean) return null;
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
