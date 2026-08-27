import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parentIdOf,
  toSiteSettingOverride,
  validateOverrideDecideBody,
  validateOverrideRequestBody,
} from "../src/sites/site-override-rules.mjs";

describe("site override rules (X-04)", () => {
  it("reads parent id from either shape", () => {
    assert.equal(parentIdOf({ parent_id: "p1" }), "p1");
    assert.equal(parentIdOf({ parentId: "p2" }), "p2");
    assert.equal(parentIdOf({}), null);
  });

  it("accepts matching_mode and retention payloads", () => {
    const mode = validateOverrideRequestBody({
      settingKind: "matching_mode",
      payload: { matchingMode: "C" },
    });
    assert.equal(mode.ok, true);
    assert.equal(mode.parsed.payload.matchingMode, "C");

    const ret = validateOverrideRequestBody({
      settingKind: "order_retention",
      payload: { orderDeleteDays: 180 },
    });
    assert.equal(ret.ok, true);
    assert.equal(ret.parsed.payload.orderDeleteDays, 180);
  });

  it("rejects Mode A and short xPub", () => {
    const mode = validateOverrideRequestBody({
      settingKind: "matching_mode",
      payload: { matchingMode: "A" },
    });
    assert.equal(mode.ok, false);
    assert.equal(mode.code, "invalid_matching_mode");

    const xpub = validateOverrideRequestBody({
      settingKind: "xpub",
      payload: { asset: "USDT", network: "tron", xPub: "too-short" },
    });
    assert.equal(xpub.ok, false);
    assert.equal(xpub.code, "invalid_xpub");
  });

  it("requires MFA only when approving wallet/xPub", () => {
    const modeOk = validateOverrideDecideBody({ decision: "approve" }, "matching_mode");
    assert.equal(modeOk.ok, true);
    const settle = validateOverrideDecideBody({ decision: "approve" }, "settlement");
    assert.equal(settle.ok, false);
    assert.equal(settle.code, "mfa_required");
    const settleMfa = validateOverrideDecideBody(
      { decision: "approve", mfaCode: "123456" },
      "settlement",
    );
    assert.equal(settleMfa.ok, true);
    const deny = validateOverrideDecideBody({ decision: "deny" }, "settlement");
    assert.equal(deny.ok, false);
  });

  it("redacts xPub from public override rows", () => {
    const row = toSiteSettingOverride({
      id: "ov-1",
      site_org_id: "s1",
      parent_org_id: "m1",
      setting_kind: "xpub",
      status: "pending",
      payload: { asset: "USDT", network: "tron", xPub: "xpub6secretmaterialxxxx" },
      requested_by: "u1",
      decided_by: null,
      decided_at: null,
      created_at: "2026-08-27T00:00:00.000Z",
    });
    assert.equal(row.payload.xPubConfigured, true);
    assert.equal(row.payload.xPub, undefined);
  });
});
