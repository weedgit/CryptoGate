import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MATCHING_MODE,
  matchingModeAllowedOnOrgType,
  toMatchingModeSettings,
  validateMatchingModeBody,
} from "../src/matching-mode/matching-mode-rules.mjs";

describe("matching mode rules", () => {
  it("allows matching mode only on merchant orgs", () => {
    assert.equal(matchingModeAllowedOnOrgType("merchant"), true);
    assert.equal(matchingModeAllowedOnOrgType("merchant_site"), true);
    assert.equal(matchingModeAllowedOnOrgType("agent"), false);
  });

  it("defaults to Mode B when unset", () => {
    assert.equal(DEFAULT_MATCHING_MODE, "B");
    assert.deepEqual(toMatchingModeSettings(null, "org-1"), {
      orgId: "org-1",
      matchingMode: "B",
      source: "merchant",
      parentOrgId: null,
      effectiveOrgId: "org-1",
    });
  });

  it("accepts B C D S", () => {
    for (const matchingMode of ["B", "C", "D", "S"]) {
      const r = validateMatchingModeBody({ matchingMode });
      assert.equal(r.ok, true);
      assert.equal(r.parsed.matchingMode, matchingMode);
    }
  });

  it("rejects unknown modes", () => {
    const r = validateMatchingModeBody({ matchingMode: "A" });
    assert.equal(r.ok, false);
    assert.equal(r.code, "invalid_matching_mode");
  });
});
