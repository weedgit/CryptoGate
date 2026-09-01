import { HDKey } from "@scure/bip32";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { base58check } from "@scure/base";
import { createHash } from "node:crypto";
import { isWatchOnlyXpub } from "../security/spend-material.mjs";

const b58check = base58check(sha256);

/** Account-level xPub (m/44'/195'/0'); we derive the external chain + index. */
export const HD_DERIVE_PATH_TEMPLATE = "0/{index}";

const TRON_ADDRESS_PREFIX = 0x41;

/**
 * Short fingerprint of an xPub for pool uniqueness — not reversible to the xPub.
 * @param {string} xpub
 */
export function xpubFingerprint(xpub) {
  return createHash("sha256").update(xpub, "utf8").digest("hex").slice(0, 16);
}

/**
 * Tron mainnet address (base58check, 0x41) from a compressed secp256k1 public key.
 * Watch-only: no private key material.
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
 * Derive receive address at 0/{hdIndex} from a BIP32 xPub (Tron USDT Phase 1).
 * @param {string} xpub
 * @param {number} hdIndex
 */
export function deriveTronAddressFromXpub(xpub, hdIndex) {
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
  return tronAddressFromPublicKey(child.publicKey);
}
