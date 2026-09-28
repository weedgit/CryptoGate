import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canEditOrgProfile, effectiveRoleOnOrg } from "../src/orgs/role-policy.mjs";

const ORGS = {
  a1: { id: "a1", type: "agent", parent_id: null },
  m1: { id: "m1", type: "merchant", parent_id: "a1" },
  s1: { id: "s1", type: "merchant_site", parent_id: "m1" },
  s2: { id: "s2", type: "merchant_site", parent_id: "s1" },
};
const getById = async (id) => ORGS[id] ?? null;
const caller = (orgId, role) => ({ platformOperator: false, memberships: [{ orgId, role }] });

describe("effectiveRoleOnOrg", () => {
  it("merchant Owner/Admin manage nested sites", async () => {
    assert.equal(await effectiveRoleOnOrg(caller("m1", "administrator"), ORGS.s2, getById), "administrator");
    assert.equal(await effectiveRoleOnOrg(caller("m1", "owner"), ORGS.s1, getById), "owner");
  });

  it("parent-site Owner manages sub-sites", async () => {
    assert.equal(await effectiveRoleOnOrg(caller("s1", "owner"), ORGS.s2, getById), "owner");
  });

  it("cashier / viewer on the merchant gain nothing on sites", async () => {
    assert.equal(await effectiveRoleOnOrg(caller("m1", "cashier"), ORGS.s1, getById), null);
    assert.equal(await effectiveRoleOnOrg(caller("m1", "viewer"), ORGS.s1, getById), null);
  });

  it("does not climb past the merchant to the agent", async () => {
    assert.equal(await effectiveRoleOnOrg(caller("a1", "owner"), ORGS.s1, getById), null);
  });

  it("non-site orgs use the direct role only", async () => {
    assert.equal(await effectiveRoleOnOrg(caller("a1", "owner"), ORGS.m1, getById), null);
    assert.equal(await effectiveRoleOnOrg(caller("m1", "owner"), ORGS.m1, getById), "owner");
  });

  it("canEditOrgProfile accepts the effective role", () => {
    const merchantAdmin = caller("m1", "administrator");
    assert.equal(canEditOrgProfile(merchantAdmin, ORGS.s1), false);
    assert.equal(canEditOrgProfile(merchantAdmin, ORGS.s1, "administrator"), true);
  });
});
