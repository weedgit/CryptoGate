import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HDKey } from "@scure/bip32";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  HD_DERIVE_PATH_TEMPLATE,
  deriveReceiveAddressFromXpub,
  deriveTronAddressFromXpub,
  deriveEvmAddressFromXpub,
  deriveBitcoinAddressFromXpub,
  deriveSolanaAddressFromXpub,
  deriveTonAddressFromMasterPubkey,
  tronAddressFromPublicKey,
  xpubFingerprint,
} from "../src/mode-s/hd-derive.mjs";
import { hdMaterialFingerprint } from "../src/security/spend-material.mjs";
import {
  hdPoolCooldownMs,
  toHdPoolAddress,
  toHdPoolList,
} from "../src/mode-s/hd-pool-rules.mjs";
import { mapAssignError } from "../src/orders/order-assign.mjs";

// BIP32 test vector 1 seed → public xPub only (no spend key stored).
const VECTOR_XPUB = HDKey.fromMasterSeed(
  Uint8Array.from(Buffer.from("000102030405060708090a0b0c0d0e0f", "hex")),
).publicExtendedKey;

describe("hd derive (watch-only)", () => {
  it("fingerprints xPub without echoing it", () => {
    const fp = xpubFingerprint(VECTOR_XPUB);
    assert.equal(fp.length, 16);
    assert.equal(fp.includes("xpub"), false);
    assert.equal(hdMaterialFingerprint(VECTOR_XPUB), fp);
  });

  it("derives a stable Tron address at 0/{index}", () => {
    const a0 = deriveTronAddressFromXpub(VECTOR_XPUB, 0);
    const a0b = deriveTronAddressFromXpub(VECTOR_XPUB, 0);
    const a1 = deriveTronAddressFromXpub(VECTOR_XPUB, 1);
    assert.equal(a0, a0b);
    assert.notEqual(a0, a1);
    assert.match(a0, /^T[1-9A-HJ-NP-Za-km-z]{33}$/);
    assert.match(a1, /^T[1-9A-HJ-NP-Za-km-z]{33}$/);
    assert.equal(HD_DERIVE_PATH_TEMPLATE, "0/{index}");
  });

  it("derives EVM checksum addresses", () => {
    const a0 = deriveEvmAddressFromXpub(VECTOR_XPUB, 0);
    assert.match(a0, /^0x[0-9a-fA-F]{40}$/);
    assert.match(a0, /[A-F]/);
    assert.notEqual(a0, deriveEvmAddressFromXpub(VECTOR_XPUB, 1));
  });

  it("derives Bitcoin P2PKH from xpub", () => {
    const a0 = deriveBitcoinAddressFromXpub(VECTOR_XPUB, 0);
    assert.match(a0, /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/);
  });

  it("routes deriveReceiveAddressFromXpub by network family", () => {
    const tron = deriveReceiveAddressFromXpub("tron", VECTOR_XPUB, 0);
    const nile = deriveReceiveAddressFromXpub("tron_nile", VECTOR_XPUB, 0);
    const eth = deriveReceiveAddressFromXpub("ethereum", VECTOR_XPUB, 0);
    const bsc = deriveReceiveAddressFromXpub("bnb_smart_chain", VECTOR_XPUB, 0);
    const polygon = deriveReceiveAddressFromXpub("polygon", VECTOR_XPUB, 0);
    const arb = deriveReceiveAddressFromXpub("arbitrum_one", VECTOR_XPUB, 0);
    const base = deriveReceiveAddressFromXpub("base", VECTOR_XPUB, 0);
    const btc = deriveReceiveAddressFromXpub("bitcoin", VECTOR_XPUB, 0);
    assert.equal(tron, nile);
    assert.match(eth, /^0x/);
    assert.match(bsc, /^0x/);
    assert.match(polygon, /^0x/);
    assert.match(arb, /^0x/);
    assert.match(base, /^0x/);
    assert.match(btc, /^[13]/);
  });

  it("derives Solana addresses from ed25519 extended pubkey", () => {
    const scalar = Uint8Array.from(
      Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex"),
    ).slice(0, 32);
    const pub = ed25519.getPublicKey(scalar);
    const extended = Buffer.concat([pub, pub]).toString("hex");
    const a0 = deriveSolanaAddressFromXpub(extended, 0);
    const a1 = deriveSolanaAddressFromXpub(extended, 1);
    assert.notEqual(a0, a1);
    assert.match(a0, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    const routed = deriveReceiveAddressFromXpub("solana", extended, 0);
    assert.equal(routed, a0);
  });

  it("derives TON v4 subwallet addresses from ed25519 master pubkey", () => {
    const scalar = Uint8Array.from(
      Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex"),
    ).slice(0, 32);
    const pubHex = Buffer.from(ed25519.getPublicKey(scalar)).toString("hex");
    const a0 = deriveTonAddressFromMasterPubkey(pubHex, 0);
    const a1 = deriveTonAddressFromMasterPubkey(pubHex, 1);
    assert.notEqual(a0, a1);
    assert.match(a0, /^UQ/);
    const routed = deriveReceiveAddressFromXpub("ton", pubHex, 0);
    assert.equal(routed, a0);
  });

  it("rejects invalid xPub and index", () => {
    assert.throws(() => deriveTronAddressFromXpub("not-an-xpub", 0), /BIP32/);
    assert.throws(() => deriveTronAddressFromXpub(VECTOR_XPUB, -1), /hdIndex/);
    const xprv = HDKey.fromMasterSeed(
      Uint8Array.from(Buffer.from("000102030405060708090a0b0c0d0e0f", "hex")),
    ).privateExtendedKey;
    assert.throws(() => deriveTronAddressFromXpub(xprv, 0), /BIP32/);
  });

  it("encodes a Tron address from a compressed public key", () => {
    const G = secp256k1.Point.BASE.toBytes(true);
    const addr = tronAddressFromPublicKey(G);
    assert.match(addr, /^T[1-9A-HJ-NP-Za-km-z]{33}$/);
  });
});

describe("hd pool rules", () => {
  it("defaults cooldown to 24h and maps pool rows without xPub", () => {
    const prev = process.env.HD_POOL_COOLDOWN_MS;
    delete process.env.HD_POOL_COOLDOWN_MS;
    assert.equal(hdPoolCooldownMs(), 86_400_000);
    if (prev === undefined) delete process.env.HD_POOL_COOLDOWN_MS;
    else process.env.HD_POOL_COOLDOWN_MS = prev;

    const list = toHdPoolList(
      [
        {
          id: "p1",
          org_id: "o1",
          asset: "USDT",
          network: "tron",
          hd_index: 0,
          receive_address: "Taddr",
          status: "IN_USE",
          cooldown_until: null,
          last_order_id: "ord-1",
        },
      ],
      { network: "tron" },
    );
    assert.equal(list.derivationPath, "0/{index}");
    assert.equal(list.items[0].status, "IN_USE");
    const tonList = toHdPoolList([], { network: "ton" });
    assert.equal(tonList.derivationPath, "subwallet/{index}");
    const mapped = toHdPoolAddress({
      id: "p1",
      org_id: "o1",
      asset: "USDT",
      network: "tron",
      hd_index: 2,
      receive_address: "Taddr",
      status: "FREE",
      cooldown_until: null,
      last_order_id: null,
    });
    assert.equal(mapped.hdIndex, 2);
    assert.equal(mapped.status, "FREE");
    assert.equal("xPub" in mapped, false);
  });
});

describe("mapAssignError HD pool", () => {
  it("maps derive failures separately from missing xPub", () => {
    const invalid = mapAssignError(new Error("xPub is not a valid BIP32 public key"));
    assert.equal(invalid.code, "invalid_xpub");
    const missing = mapAssignError(new Error("claimHdPoolAddress is required"));
    assert.equal(missing.code, "matching_mode_unavailable");
    const pool = mapAssignError(
      new Error("HD pool derivation is not available for solana"),
    );
    assert.equal(pool.code, "hd_pool_unavailable");
  });
});
