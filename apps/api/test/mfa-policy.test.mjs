import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canEnrollMfa, mustEnrollMfa } from "../src/orgs/role-policy.mjs";

describe("MFA enrollment policy", () => {
  it("allows enroll for platform / merchant / agent Owner or Administrator", () => {
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

  it("denies enroll for Viewer, Cashier, and site Owner/Admin", () => {
    assert.equal(
      canEnrollMfa([{ role: "viewer", orgType: "platform" }]),
      false,
    );
    assert.equal(
      canEnrollMfa([{ role: "cashier", orgType: "merchant" }]),
      false,
    );
    assert.equal(
      canEnrollMfa([{ role: "owner", orgType: "merchant_site" }]),
      false,
    );
  });

  it("forces MFA only for platform and merchant Owner/Admin", () => {
    assert.equal(
      mustEnrollMfa([{ role: "owner", orgType: "platform" }]),
      true,
    );
    assert.equal(
      mustEnrollMfa([{ role: "administrator", orgType: "merchant" }]),
      true,
    );
    assert.equal(
      mustEnrollMfa([{ role: "owner", orgType: "agent" }]),
      false,
    );
    assert.equal(
      mustEnrollMfa([{ role: "owner", orgType: "merchant_site" }]),
      false,
    );
    assert.equal(
      mustEnrollMfa([{ role: "cashier", orgType: "merchant" }]),
      false,
    );
  });

  it("treats missing memberships as no MFA enroll/force", () => {
    assert.equal(canEnrollMfa(undefined), false);
    assert.equal(canEnrollMfa(null), false);
    assert.equal(mustEnrollMfa(undefined), false);
  });
});
