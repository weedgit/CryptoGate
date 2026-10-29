import { HDKey } from "@scure/bip32";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { base58check } from "@scure/base";
import {
  HdDerivationFamily,
  resolveHdDerivationFamily,
  supportsModeSHdDerivation,
} from "@paymentgate/domain";
import { isWatchOnlyXpub } from "../security/spend-material.mjs";

const b58check = base58check(sha256);

/** Account-level xPub; external chain + index (Tron / EVM). */
export const HD_DERIVE_PATH_TEMPLATE = "0/{index}";

const TRON_ADDRESS_PREFIX = 0x41;

export {
  hdMaterialFingerprint,
  hdMaterialFingerprint as xpubFingerprint,
} from "../security/spend-material.mjs";

/**
 * @param {string} xpub
 * @param {number} hdIndex
 * @returns {import("@scure/bip32").HDKey}
 */
function deriveSecp256k1ChildKey(xpub, hdIndex) {
  if (!Number.isInteger(hdIndex) || hdIndex < 0) {
    throw new Error("hdIndex must be a non-negative integer");
  }
  if (!isWatchOnlyXpub(xpub)) {
    throw new Error("xPub is not a valid BIP32 public key");
  }
  let root;
  try {
    root = HDKey.fromExtendedKey(xpub);
  } catch {
    throw new Error("xPub is not a valid BIP32 public key");
  }
  if (root.privateKey) {
    throw new Error("xPub is not a valid BIP32 public key");
  }
  const child = root.derive(`m/0/${hdIndex}`);
  if (!child.publicKey) {
    throw new Error(
      "HD pool could not derive a public key from this xPub (need account-level non-hardened children)",
    );
  }
  return child;
}

/**
 * Tron address (base58check, 0x41) from a compressed secp256k1 public key.
 * @param {Uint8Array} compressedPublicKey
 */
export function tronAddressFromPublicKey(compressedPublicKey) {
  const uncompressed = secp256k1.Point.fromBytes(compressedPublicKey).toBytes(false);
  const hash = keccak_256(uncompressed.subarray(1));
  const payload = new Uint8Array(21);
  payload[0] = TRON_ADDRESS_PREFIX;
  payload.set(hash.subarray(12), 1);
  return b58check.encode(payload);
}

/**
 * @param {string} xpub
 * @param {number} hdIndex
 */
export function deriveTronAddressFromXpub(xpub, hdIndex) {
  const child = deriveSecp256k1ChildKey(xpub, hdIndex);
  return tronAddressFromPublicKey(child.publicKey);
}

/**
 * @param {Uint8Array} compressedPublicKey
 */
export function evmAddressFromPublicKey(compressedPublicKey) {
  const uncompressed = secp256k1.Point.fromBytes(compressedPublicKey).toBytes(false);
  const hash = keccak_256(uncompressed.subarray(1));
  const addr = hash.subarray(12);
  const hex = [...addr].map((b) => b.toString(16).padStart(2, "0")).join("");
  return toEip55Checksum(`0x${hex}`);
}

/**
 * @param {string} address
 */
export function toEip55Checksum(address) {
  const lower = address.toLowerCase().replace(/^0x/, "");
  const hash = keccak_256(new TextEncoder().encode(lower));
  let out = "0x";
  for (let i = 0; i < lower.length; i += 1) {
    const nibble = hash[i >> 1];
    const nybble = i % 2 === 0 ? nibble >> 4 : nibble & 0x0f;
    out += nybble >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

/**
 * @param {string} xpub
 * @param {number} hdIndex
 */
export function deriveEvmAddressFromXpub(xpub, hdIndex) {
  const child = deriveSecp256k1ChildKey(xpub, hdIndex);
  return evmAddressFromPublicKey(child.publicKey);
}

/**
 * Derive a receive address for Mode S HD pool assignment.
 * @param {string} network catalog network id
 * @param {string} xpub watch-only BIP32 xPub
 * @param {number} hdIndex
 */
export function deriveReceiveAddressFromXpub(network, xpub, hdIndex) {
  if (!supportsModeSHdDerivation(network)) {
    throw new Error(`HD pool derivation is not available for ${network}`);
  }
  switch (resolveHdDerivationFamily(network)) {
    case HdDerivationFamily.Tron:
      return deriveTronAddressFromXpub(xpub, hdIndex);
    case HdDerivationFamily.Evm:
      return deriveEvmAddressFromXpub(xpub, hdIndex);
    default:
      throw new Error(`HD pool derivation is not available for ${network}`);
  }
}
