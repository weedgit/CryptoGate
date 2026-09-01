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
