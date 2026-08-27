import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canEnrollMfa } from "../src/orgs/role-policy.mjs";

describe("MFA enrollment policy", () => {
  it("allows Owner or Administrator on any org", () => {
    assert.equal(
      canEnrollMfa([{ role: "owner", orgType: "platform" }]),
      true,
    );
    assert.equal(
      canEnrollMfa([{ role: "administrator", orgType: "agent" }]),
      true,
    );
    assert.equal(
      canEnrollMfa([{ role: "administrator", orgType: "merchant" }]),
      true,
    );
  });

  it("denies Viewer and Cashier", () => {
    assert.equal(
      canEnrollMfa([{ role: "viewer", orgType: "platform" }]),
      false,
    );
    assert.equal(
      canEnrollMfa([{ role: "cashier", orgType: "merchant" }]),
      false,
    );
  });
});
