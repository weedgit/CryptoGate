import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAssignOrgRole,
  canInviteToOrg,
  canListOrgUsers,
  canManageMemberPosPin,
  canManageMembershipLifecycle,
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

describe("platform operator team management", () => {
  const admin = {
    platformOwner: false,
    platformOperator: true,
    roleOnOrg: null,
    roleOnParent: null,
    memberCount: 3,
    invitedRole: "owner",
  };

  it("lets platform administrator invite, assign, and remove including owner", () => {
    assert.equal(canInviteToOrg(admin), true);
    assert.equal(canAssignOrgRole(admin), true);
    assert.equal(canManageMembershipLifecycle(admin), true);
  });

  it("denies platform viewer", () => {
    const viewer = {
      platformOwner: false,
      platformOperator: false,
      roleOnOrg: null,
      roleOnParent: null,
      memberCount: 3,
      invitedRole: "administrator",
    };
    assert.equal(canInviteToOrg(viewer), false);
    assert.equal(canAssignOrgRole(viewer), false);
    assert.equal(canManageMembershipLifecycle(viewer), false);
  });
});

describe("canManageMemberPosPin", () => {
  it("allows owner, administrator, and platform owner", () => {
    assert.equal(
      canManageMemberPosPin({ platformOwner: false, roleOnOrg: "owner" }),
      true,
    );
    assert.equal(
      canManageMemberPosPin({
        platformOwner: false,
        roleOnOrg: "administrator",
      }),
      true,
    );
    assert.equal(
      canManageMemberPosPin({ platformOwner: true, roleOnOrg: null }),
      true,
    );
  });

  it("allows platform administrator", () => {
    assert.equal(
      canManageMemberPosPin({
        platformOwner: false,
        platformOperator: true,
        roleOnOrg: null,
      }),
      true,
    );
  });

  it("denies viewer and cashier", () => {
    assert.equal(
      canManageMemberPosPin({ platformOwner: false, roleOnOrg: "viewer" }),
      false,
    );
    assert.equal(
      canManageMemberPosPin({ platformOwner: false, roleOnOrg: "cashier" }),
      false,
    );
  });
});
