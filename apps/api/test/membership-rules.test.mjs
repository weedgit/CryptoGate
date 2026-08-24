import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canListOrgUsers } from "../src/orgs/membership-rules.mjs";

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
