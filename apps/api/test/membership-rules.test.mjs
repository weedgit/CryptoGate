import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAssignOrgRole,
  canInviteToOrg,
  canManageOrgTree,
  canManageTeam,
  isLastOwnerDemotion,
  isPlatformOperator,
  isPlatformStaff,
  roleAllowedOnOrg,
} from "../src/orgs/membership-rules.mjs";

describe("membership rules", () => {
  it("allows cashier only on merchant orgs", () => {
    assert.equal(roleAllowedOnOrg("cashier", "merchant"), true);
    assert.equal(roleAllowedOnOrg("cashier", "merchant_site"), true);
    assert.equal(roleAllowedOnOrg("cashier", "agent"), false);
    assert.equal(roleAllowedOnOrg("cashier", "platform"), false);
    assert.equal(roleAllowedOnOrg("owner", "platform"), true);
  });

  it("reserves team management for Owner", () => {
    assert.equal(canManageTeam("owner"), true);
    assert.equal(canManageTeam("administrator"), false);
    assert.equal(canManageTeam("cashier"), false);
  });

  it("lets Owner and Administrator grow the org tree", () => {
    assert.equal(canManageOrgTree("owner"), true);
    assert.equal(canManageOrgTree("administrator"), true);
    assert.equal(canManageOrgTree("viewer"), false);
  });

  it("treats platform Owner/Admin as operators", () => {
    assert.equal(
      isPlatformOperator([{ orgType: "platform", role: "administrator" }]),
      true,
    );
    assert.equal(
      isPlatformOperator([{ orgType: "merchant", role: "owner" }]),
      false,
    );
  });

  it("lets parent Owner/Admin invite the first Owner only", () => {
    const bootstrap = {
      platformOwner: false,
      platformOperator: false,
      roleOnOrg: null,
      roleOnParent: "administrator",
      memberCount: 0,
      invitedRole: "owner",
    };
    assert.equal(canInviteToOrg(bootstrap), true);
    assert.equal(canInviteToOrg({ ...bootstrap, invitedRole: "viewer" }), false);
    assert.equal(canInviteToOrg({ ...bootstrap, memberCount: 1 }), false);
    assert.equal(canInviteToOrg({ ...bootstrap, roleOnParent: "viewer" }), false);
  });

  it("does not let a stranger claim an empty org", () => {
    assert.equal(
      canInviteToOrg({
        platformOwner: false,
        platformOperator: false,
        roleOnOrg: null,
        roleOnParent: null,
        memberCount: 0,
        invitedRole: "owner",
      }),
      false,
    );
  });

  it("reserves role assignment for Owner", () => {
    assert.equal(canAssignOrgRole({ platformOwner: true, roleOnOrg: null }), true);
    assert.equal(
      canAssignOrgRole({ platformOwner: false, roleOnOrg: "owner" }),
      true,
    );
    assert.equal(
      canAssignOrgRole({ platformOwner: false, roleOnOrg: "administrator" }),
      false,
    );
  });

  it("blocks demoting the last Owner", () => {
    assert.equal(
      isLastOwnerDemotion({
        existingRole: "owner",
        nextRole: "administrator",
        ownerCount: 1,
      }),
      true,
    );
    assert.equal(
      isLastOwnerDemotion({
        existingRole: "owner",
        nextRole: "administrator",
        ownerCount: 2,
      }),
      false,
    );
  });

  it("detects platform staff including viewers", () => {
    assert.equal(
      isPlatformStaff([{ orgType: "platform", role: "viewer" }]),
      true,
    );
    assert.equal(
      isPlatformStaff([{ orgType: "platform", role: "cashier" }]),
      false,
    );
    assert.equal(isPlatformOperator([{ orgType: "platform", role: "viewer" }]), false);
  });
});
