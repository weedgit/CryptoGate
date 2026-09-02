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

  it("rejects every override request kind — sites always inherit", () => {
    const mode = validateOverrideRequestBody({
      settingKind: "matching_mode",
      payload: { matchingMode: "C" },
    });
    assert.equal(mode.ok, false);
    assert.equal(mode.code, "invalid_request");

    const ret = validateOverrideRequestBody({
      settingKind: "order_retention",
      payload: { orderDeleteDays: 180 },
    });
    assert.equal(ret.ok, false);

    const xpub = validateOverrideRequestBody({
      settingKind: "xpub",
      payload: { asset: "USDT", network: "tron", xPub: "xpub6secretmaterialxxxx" },
    });
    assert.equal(xpub.ok, false);
    assert.equal(xpub.code, "invalid_request");

    const settle = validateOverrideRequestBody({
      settingKind: "settlement",
      payload: { asset: "USDT", network: "tron", address: "Txyz" },
    });
    assert.equal(settle.ok, false);
    assert.equal(settle.code, "invalid_request");
  });

  it("approves matching without MFA; deny still needs a reason", () => {
    const modeOk = validateOverrideDecideBody({ decision: "approve" }, "matching_mode");
    assert.equal(modeOk.ok, true);
    const deny = validateOverrideDecideBody({ decision: "deny" }, "matching_mode");
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
