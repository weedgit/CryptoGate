import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  API_SIGNING_MAX_SKEW_SECONDS,
  API_SIGNING_NONCE_TTL_SECONDS,
} from "@paymentgate/domain";

const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;
const TIMESTAMP_RE = /^[0-9]{10,12}$/;
const SIGNATURE_RE = /^[0-9a-f]{64}$/;
const GENERIC_REJECT = "Request signature rejected";

/**
 * @param {string | string[] | undefined} raw
 */
function headerString(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return "";
  return value.trim();
}

export function signingRejectMessage() {
  return GENERIC_REJECT;
}

export function signingMaxSkewSeconds() {
  const raw = process.env.API_SIGNING_MAX_SKEW_SECONDS;
  const n = raw ? Number(raw) : API_SIGNING_MAX_SKEW_SECONDS;
  return Number.isFinite(n) && n >= 0 ? n : API_SIGNING_MAX_SKEW_SECONDS;
}

export function signingNonceTtlSeconds() {
  const raw = process.env.API_SIGNING_NONCE_TTL_SECONDS;
  const n = raw ? Number(raw) : API_SIGNING_NONCE_TTL_SECONDS;
  return Number.isFinite(n) && n >= 0 ? n : API_SIGNING_NONCE_TTL_SECONDS;
}

/**
 * @param {import("node:http").IncomingHttpHeaders} headers
 * @returns {{ ok: true, keyId: string, timestamp: string, nonce: string, signature: string } | { ok: false, code: "signature_invalid" }}
 */
export function parseSigningHeaders(headers) {
  const keyId = headerString(headers["x-api-key"]);
  const timestamp = headerString(headers["x-timestamp"]);
  const nonce = headerString(headers["x-nonce"]);
  const signature = headerString(headers["x-signature"]);
  if (!keyId || !timestamp || !nonce || !signature) {
    return { ok: false, code: "signature_invalid" };
  }
  if (!TIMESTAMP_RE.test(timestamp) || !NONCE_RE.test(nonce) || !SIGNATURE_RE.test(signature)) {
    return { ok: false, code: "signature_invalid" };
  }
  return { ok: true, keyId, timestamp, nonce, signature };
}

/**
 * @param {string} timestamp
 * @param {number} nowSec
 * @returns {{ ok: true } | { ok: false, code: "timestamp_skew" }}
 */
export function checkTimestampSkew(timestamp, nowSec) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, code: "timestamp_skew" };
  }
  if (Math.abs(nowSec - ts) > signingMaxSkewSeconds()) {
    return { ok: false, code: "timestamp_skew" };
  }
  return { ok: true };
}

/**
 * @param {Buffer} rawBody
 */
export function sha256Hex(rawBody) {
  return createHash("sha256").update(rawBody).digest("hex");
}

/**
 * Byte-stable canonical string (M3-01).
 * @param {{
 *   timestamp: string,
 *   nonce: string,
 *   method: string,
 *   pathAndQuery: string,
 *   rawBody: Buffer,
 * }} p
 */
export function canonicalString(p) {
  return [
    p.timestamp,
    p.nonce,
    p.method.toUpperCase(),
    p.pathAndQuery,
    sha256Hex(p.rawBody),
  ].join("\n");
}

/**
 * @param {string} secret
 * @param {string} canonical
 */
export function hmacSha256Hex(secret, canonical) {
  return createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
}

/**
 * @param {string} secret
 * @param {string} canonical
 * @param {string} signatureHex
 */
export function hmacMatches(secret, canonical, signatureHex) {
  const expected = hmacSha256Hex(secret, canonical);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signatureHex, "hex");
  if (a.length !== 32 || b.length !== 32) return false;
  return timingSafeEqual(a, b);
}
