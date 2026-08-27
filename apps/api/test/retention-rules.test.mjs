import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ORDER_DELETE_DAYS } from "@cryptogate/domain";
import {
  toRetentionSettings,
  validateRetentionBody,
} from "../src/retention/retention-rules.mjs";

describe("retention rules (X-04)", () => {
  it("defaults to 90 days when unset", () => {
    assert.equal(DEFAULT_ORDER_DELETE_DAYS, 90);
    assert.deepEqual(toRetentionSettings(null, "org-1"), {
      orgId: "org-1",
      orderDeleteDays: 90,
      source: "merchant",
      parentOrgId: null,
      effectiveOrgId: "org-1",
    });
  });

  it("accepts 7–3650 days", () => {
    assert.equal(validateRetentionBody({ orderDeleteDays: 7 }).ok, true);
    assert.equal(validateRetentionBody({ orderDeleteDays: 3650 }).ok, true);
    assert.equal(validateRetentionBody({ orderDeleteDays: 6 }).ok, false);
    assert.equal(validateRetentionBody({ orderDeleteDays: 1.5 }).ok, false);
  });
});
