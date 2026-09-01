import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canListOrgUsers,
  roleAllowedOnOrg,
} from "../src/orgs/membership-rules.mjs";

describe("roleAllowedOnOrg", () => {
  it("allows cashier on merchant and merchant_site only", () => {
    assert.equal(roleAllowedOnOrg("cashier", "merchant"), true);
    assert.equal(roleAllowedOnOrg("cashier", "merchant_site"), true);
    assert.equal(roleAllowedOnOrg("Cashier", "merchant"), true);
    assert.equal(roleAllowedOnOrg("cashier", "agent"), false);
    assert.equal(roleAllowedOnOrg("cashier", "platform"), false);
    assert.equal(roleAllowedOnOrg("administrator", "agent"), true);
  });
});

describe("org membership list rules", () => {
  it("allows platform operators", () => {
    assert.equal(canListOrgUsers(null, true), true);
  });

  it("allows owner admin viewer on org", () => {
    assert.equal(canListOrgUsers("owner", false), true);
    assert.equal(canListOrgUsers("administrator", false), true);
    assert.equal(canListOrgUsers("viewer", false), true);
  });

  it("denies cashier and non-members", () => {
    assert.equal(canListOrgUsers("cashier", false), false);
    assert.equal(canListOrgUsers(null, false), false);
  });
});
