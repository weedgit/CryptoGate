import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FULFILLMENT_POLICY,
  fulfillmentPolicyAllowedOnOrgType,
  toFulfillmentPolicySettings,
  validateFulfillmentPolicyBody,
} from "../src/fulfillment-policy/fulfillment-policy-rules.mjs";

describe("fulfillment policy rules", () => {
  it("allows merchant org types only", () => {
    assert.equal(fulfillmentPolicyAllowedOnOrgType("merchant"), true);
    assert.equal(fulfillmentPolicyAllowedOnOrgType("merchant_site"), true);
    assert.equal(fulfillmentPolicyAllowedOnOrgType("agent"), false);
  });

  it("accepts on_completed and on_verifying", () => {
    for (const fulfillmentPolicy of ["on_completed", "on_verifying"]) {
      const r = validateFulfillmentPolicyBody({ fulfillmentPolicy });
      assert.equal(r.ok, true);
      assert.equal(r.parsed.fulfillmentPolicy, fulfillmentPolicy);
    }
  });

  it("rejects invalid policy", () => {
    const r = validateFulfillmentPolicyBody({ fulfillmentPolicy: "instant" });
    assert.equal(r.ok, false);
    assert.equal(r.code, "invalid_fulfillment_policy");
  });

  it("defaults when row missing", () => {
    const out = toFulfillmentPolicySettings(null, "org-1");
    assert.equal(out.fulfillmentPolicy, DEFAULT_FULFILLMENT_POLICY);
    assert.equal(out.orgId, "org-1");
  });
});
