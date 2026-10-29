import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  toXpubSettings,
  validateXpubBody,
  xpubAllowedOnOrgType,
} from "../src/xpub/xpub-rules.mjs";

describe("xpub rules", () => {
  it("allows xPub only on merchant orgs", () => {
    assert.equal(xpubAllowedOnOrgType("merchant"), true);
    assert.equal(xpubAllowedOnOrgType("agent"), false);
  });

  it("requires MFA and rejects short xPubs", () => {
    assert.equal(
      validateXpubBody({
        asset: "USDT",
        network: "tron",
        xPub: "xpub-too-short",
        mfaCode: "123456",
      }).code,
      "invalid_xpub",
    );
    assert.equal(
      validateXpubBody({
        asset: "USDT",
        network: "tron",
        xPub: "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKp",
      }).code,
      "mfa_required",
    );
  });

  it("rejects raw ed25519 / Solana key material and Solana Mode S (H2)", () => {
    const hex32 = "11".repeat(32);
    const hex64 = "22".repeat(64);
    for (const xPub of [hex32, hex64]) {
      const r = validateXpubBody({ asset: "USDT", network: "tron", xPub, mfaCode: "123456" });
      assert.equal(r.ok, false);
      assert.equal(r.code, "invalid_xpub");
    }
    const solanaKey = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
    const sol = validateXpubBody({
      asset: "USDC",
      network: "solana",
      xPub: solanaKey,
      mfaCode: "123456",
    });
    assert.equal(sol.ok, false);
    const solXpub = validateXpubBody({
      asset: "USDC",
      network: "solana",
      xPub: "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8",
      mfaCode: "123456",
    });
    assert.equal(solXpub.ok, false);
    assert.ok(["mode_s_network_unsupported", "asset_network_disabled"].includes(solXpub.code));
  });

  it("rejects private extended keys", () => {
    const rejected = validateXpubBody({
      asset: "USDT",
      network: "tron",
      xPub: "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4fbQkV5Yxxxx",
      mfaCode: "123456",
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, "invalid_xpub");
  });

  it("never exposes the full xPub on GET shape", () => {
    const mapped = toXpubSettings({
      org_id: "org-1",
      asset: "USDT",
      network: "tron",
      xpub: "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKpovv",
      pending_xpub: null,
      pending_activates_at: null,
    });
    assert.equal(mapped.xPubConfigured, true);
    assert.equal("xPub" in mapped, false);
    assert.equal(mapped.status, "active");
  });
});
