/**
 * Tron Base58Check address validation (shape + checksum).
 * Rejects load-seed fakes (`T` + hex) that pass alphabet length but fail checksum.
 */

import { createHash } from "node:crypto";

const TRON_BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const TRON_BASE58_MAP = (() => {
  /** @type {Record<string, number>} */
  const map = Object.create(null);
  for (let i = 0; i < TRON_BASE58_ALPHABET.length; i += 1) {
    map[TRON_BASE58_ALPHABET[i]] = i;
  }
  return map;
})();

/** Mainnet / Nile account payload: version 0x41 + 20-byte pubkey hash. */
const TRON_ADDRESS_VERSION = 0x41;
const TRON_ADDRESS_PAYLOAD_LEN = 21;
const TRON_CHECKSUM_LEN = 4;

/**
 * @param {string} input
 * @returns {Uint8Array | null}
 */
function decodeBase58(input) {
  if (typeof input !== "string" || input.length === 0) return null;
  let zeros = 0;
  while (zeros < input.length && input[zeros] === "1") zeros += 1;

  const size = (((input.length - zeros) * 733) / 1000 + 1) | 0;
  const b256 = new Uint8Array(size);
  let length = 0;

  for (let i = zeros; i < input.length; i += 1) {
    const ch = input[i];
    const value = TRON_BASE58_MAP[ch];
    if (value === undefined) return null;

    let carry = value;
    for (let j = size - 1; j >= 0; j -= 1) {
      carry += 58 * b256[j];
      b256[j] = carry & 0xff;
      carry >>= 8;
    }
    if (carry !== 0) return null;
    length = size;
  }

  let start = 0;
  while (start < length && b256[start] === 0) start += 1;

  const out = new Uint8Array(zeros + (length - start));
  out.fill(0, 0, zeros);
  out.set(b256.subarray(start), zeros);
  return out;
}

/**
 * @param {Uint8Array} bytes
 */
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest();
}

/**
 * True when `address` is a Base58Check Tron account (T…, version 0x41).
 * @param {string | null | undefined} address
 */
export function isLikelyTronAddress(address) {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed.length < 30 || trimmed.length > 36) return false;
  if (trimmed[0] !== "T") return false;

  const decoded = decodeBase58(trimmed);
  if (!decoded || decoded.length !== TRON_ADDRESS_PAYLOAD_LEN + TRON_CHECKSUM_LEN) {
    return false;
  }
  if (decoded[0] !== TRON_ADDRESS_VERSION) return false;

  const payload = decoded.subarray(0, TRON_ADDRESS_PAYLOAD_LEN);
  const checksum = decoded.subarray(TRON_ADDRESS_PAYLOAD_LEN);
  const hash = sha256(sha256(payload));
  for (let i = 0; i < TRON_CHECKSUM_LEN; i += 1) {
    if (checksum[i] !== hash[i]) return false;
  }
  return true;
}

/**
 * @param {string[]} addresses
 * @returns {{ valid: string[], skipped: number }}
 */
export function filterLikelyTronAddresses(addresses) {
  const valid = [];
  const seen = new Set();
  let skipped = 0;
  for (const raw of addresses ?? []) {
    const a = typeof raw === "string" ? raw.trim() : "";
    if (!a) {
      skipped += 1;
      continue;
    }
    if (!isLikelyTronAddress(a)) {
      skipped += 1;
      continue;
    }
    if (seen.has(a)) continue;
    seen.add(a);
    valid.push(a);
  }
  return { valid, skipped };
}

/**
 * Base58Check Tron account → 21-byte hex (`41…`, lowercase), or null.
 * @param {string | null | undefined} address
 */
export function tronBase58ToHex(address) {
  if (!isLikelyTronAddress(address)) return null;
  const decoded = decodeBase58(String(address).trim());
  if (!decoded) return null;
  return Buffer.from(decoded.subarray(0, TRON_ADDRESS_PAYLOAD_LEN)).toString("hex");
}

/**
 * @param {Uint8Array} bytes
 */
function encodeBase58(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = TRON_BASE58_ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  return "1".repeat(zeros) + out;
}

/**
 * 21-byte hex (`41…`) or 20-byte hex (EVM-style, with or without 0x) → Base58Check, or null.
 * @param {string | null | undefined} hex
 */
export function tronHexToBase58(hex) {
  if (typeof hex !== "string") return null;
  let h = hex.trim().toLowerCase().replace(/^0x/, "");
  if (/^[0-9a-f]{40}$/.test(h)) h = `41${h}`;
  if (!/^41[0-9a-f]{40}$/.test(h)) return null;
  const payload = Buffer.from(h, "hex");
  const checksum = sha256(sha256(payload)).subarray(0, TRON_CHECKSUM_LEN);
  return encodeBase58(Buffer.concat([payload, checksum]));
}
