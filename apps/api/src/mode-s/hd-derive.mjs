import { HDKey } from "@scure/bip32";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58, base58check, bech32 } from "@scure/base";
import { createHash } from "node:crypto";
import { WalletContractV4 } from "@ton/ton";
import {
  HdDerivationFamily,
  resolveHdDerivationFamily,
} from "@paymentgate/domain";
import {
  isWatchOnlyEd25519ExtendedPubkey,
  isWatchOnlyEd25519MasterPubkey,
  isWatchOnlyXpub,
} from "../security/spend-material.mjs";

const b58check = base58check(sha256);

/** Account-level xPub; external chain + index (Tron / EVM / Bitcoin). */
export const HD_DERIVE_PATH_TEMPLATE = "0/{index}";

const TRON_ADDRESS_PREFIX = 0x41;
const BITCOIN_MAINNET_P2PKH = 0x00;
const BITCOIN_MAINNET_P2WPKH = 0x00;

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
function toEip55Checksum(address) {
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
 * @param {Uint8Array} compressedPublicKey
 */
function hash160(data) {
  return createHash("ripemd160").update(createHash("sha256").update(data).digest()).digest();
}

/**
 * @param {Uint8Array} compressedPublicKey
 */
export function bitcoinP2pkhFromPublicKey(compressedPublicKey) {
  const payload = new Uint8Array(21);
  payload[0] = BITCOIN_MAINNET_P2PKH;
  payload.set(hash160(compressedPublicKey), 1);
  return b58check.encode(payload);
}

/**
 * @param {Uint8Array} compressedPublicKey
 */
export function bitcoinP2wpkhFromPublicKey(compressedPublicKey) {
  const program = hash160(compressedPublicKey);
  return bech32.encode("bc", [BITCOIN_MAINNET_P2WPKH, ...bech32.toWords(program)]);
}

/**
 * @param {string} xpub
 * @param {number} hdIndex
 */
export function deriveBitcoinAddressFromXpub(xpub, hdIndex) {
  const child = deriveSecp256k1ChildKey(xpub, hdIndex);
  const prefix = String(xpub).trim().slice(0, 4).toLowerCase();
  if (prefix === "zpub" || prefix === "vpub") {
    return bitcoinP2wpkhFromPublicKey(child.publicKey);
  }
  return bitcoinP2pkhFromPublicKey(child.publicKey);
}

/**
 * SLIP-0010 CKDpub — watch-only ed25519 child at non-hardened index.
 * @param {Uint8Array} parentPub 32 bytes
 * @param {Uint8Array} parentChainCode 32 bytes
 * @param {number} index
 * @param {number} [attemptsLeft]
 */
function ckdPubEd25519(parentPub, parentChainCode, index, attemptsLeft = 256) {
  if (!Number.isInteger(index) || index < 0 || index >= 0x80000000) {
    throw new Error("hdIndex must be a non-hardened BIP32 index");
  }
  if (attemptsLeft <= 0) {
    throw new Error("HD pool could not derive an ed25519 child public key");
  }
  const indexBytes = new Uint8Array(4);
  new DataView(indexBytes.buffer).setUint32(0, index, false);
  const data = new Uint8Array(1 + parentPub.length + 4);
  data[0] = 0x02;
  data.set(parentPub, 1);
  data.set(indexBytes, 33);
  const digest = hmac(sha512, parentChainCode, data);
  const il = digest.subarray(0, 32);
  const ir = digest.subarray(32);
  let scalar = 0n;
  for (let i = il.length - 1; i >= 0; i -= 1) {
    scalar = (scalar << 8n) | BigInt(il[i]);
  }
  if (scalar >= ed25519.Point.Fn.ORDER) {
    return ckdPubEd25519(parentPub, parentChainCode, index + 1, attemptsLeft - 1);
  }
  const parentPoint = ed25519.Point.fromBytes(parentPub);
  const childPoint = parentPoint.add(ed25519.Point.BASE.multiply(scalar));
  return { publicKey: childPoint.toBytes(), chainCode: ir, index };
}

/**
 * @param {string} material hex (64 or 128 chars) or base58 32-byte Solana pubkey
 */
function parseEd25519MasterMaterial(material) {
  const raw = String(material ?? "").trim();
  if (isWatchOnlyEd25519ExtendedPubkey(raw)) {
    const bytes = Buffer.from(raw, "hex");
    return {
      publicKey: bytes.subarray(0, 32),
      chainCode: bytes.subarray(32, 64),
    };
  }
  if (isWatchOnlyEd25519MasterPubkey(raw)) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      const publicKey = Buffer.from(raw, "hex");
      return { publicKey, chainCode: sha256(publicKey) };
    }
    const decoded = base58.decode(raw);
    if (decoded.length !== 32) {
      throw new Error("Solana master public key must decode to 32 bytes");
    }
    return { publicKey: decoded, chainCode: sha256(decoded) };
  }
  throw new Error("xPub is not a valid ed25519 master public key");
}

/**
 * @param {string} material
 * @param {number} hdIndex
 */
export function deriveSolanaAddressFromXpub(material, hdIndex) {
  const master = parseEd25519MasterMaterial(material);
  const chain0 = ckdPubEd25519(master.publicKey, master.chainCode, 0);
  const child =
    hdIndex === 0
      ? { publicKey: chain0.publicKey }
      : ckdPubEd25519(chain0.publicKey, chain0.chainCode, hdIndex);
  return base58.encode(child.publicKey);
}

/**
 * TON wallet v4 — subwallet id maps to hdIndex (watch-only ed25519 master pubkey).
 * @param {string} material hex or base58 32-byte pubkey
 * @param {number} hdIndex used as walletId
 */
export function deriveTonAddressFromMasterPubkey(material, hdIndex) {
  if (!Number.isInteger(hdIndex) || hdIndex < 0) {
    throw new Error("hdIndex must be a non-negative integer");
  }
  const master = parseEd25519MasterMaterial(material);
  const wallet = WalletContractV4.create({
    workchain: 0,
    publicKey: Buffer.from(master.publicKey),
    walletId: hdIndex,
  });
  return wallet.address.toString({ urlSafe: true, bounceable: false });
}

/**
 * Derive a receive address for Mode S HD pool assignment.
 * @param {string} network catalog network id
 * @param {string} xpub watch-only material (BIP32 xPub or ed25519 master pubkey)
 * @param {number} hdIndex
 */
export function deriveReceiveAddressFromXpub(network, xpub, hdIndex) {
  const family = resolveHdDerivationFamily(network);
  if (!family) {
    throw new Error(`HD pool derivation is not available for ${network}`);
  }
  switch (family) {
    case HdDerivationFamily.Tron:
      return deriveTronAddressFromXpub(xpub, hdIndex);
    case HdDerivationFamily.Evm:
      return deriveEvmAddressFromXpub(xpub, hdIndex);
    case HdDerivationFamily.Bitcoin:
      return deriveBitcoinAddressFromXpub(xpub, hdIndex);
    case HdDerivationFamily.Solana:
      return deriveSolanaAddressFromXpub(xpub, hdIndex);
    case HdDerivationFamily.Ton:
      return deriveTonAddressFromMasterPubkey(xpub, hdIndex);
    default:
      throw new Error(`HD pool derivation is not available for ${network}`);
  }
}
