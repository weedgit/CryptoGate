import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPersonProfileComplete } from "../src/auth/org-setup.mjs";
import {
  evaluateCrossOrgMerchantSiteInvite,
  isPlatformOrAgentOperatorMemberships,
  canUpdateAgentPayout,
  canChangeSettlementSettings,
  canOnboardSiteUnderParent,
} from "../src/orgs/role-policy.mjs";

describe("person profile completeness", () => {
  it("requires first, last, and timezone", () => {
    assert.equal(
      isPersonProfileComplete({
        firstName: "Ada",
        lastName: "Lovelace",
        timezone: "UTC",
      }),
      true,
    );
    assert.equal(
      isPersonProfileComplete({
        firstName: "Ada",
        lastName: "",
        timezone: "UTC",
      }),
      false,
    );
    assert.equal(
      isPersonProfileComplete({
        displayName: "Ada Lovelace",
        timezone: "UTC",
      }),
      true,
    );
  });
});

describe("cross-org merchant/site invite", () => {
  const verified = { emailVerified: true, phoneVerified: true };
  const unverified = { emailVerified: true, phoneVerified: false };

  it("allows verified platform O/A", () => {
    const r = evaluateCrossOrgMerchantSiteInvite(verified, [
      { orgType: "platform", role: "administrator" },
    ]);
    assert.equal(r.ok, true);
  });

  it("rejects platform viewer", () => {
    const r = evaluateCrossOrgMerchantSiteInvite(verified, [
      { orgType: "platform", role: "viewer" },
    ]);
    assert.equal(r.ok, false);
    assert.equal(r.code, "invite_role_forbidden");
  });

  it("rejects unverified agent O/A", () => {
    const r = evaluateCrossOrgMerchantSiteInvite(unverified, [
      { orgType: "agent", role: "owner" },
    ]);
    assert.equal(r.ok, false);
    assert.equal(r.code, "invite_unverified");
  });

  it("detects platform/agent operators for owner onboard block", () => {
    assert.equal(
      isPlatformOrAgentOperatorMemberships([
        { orgType: "agent", role: "owner" },
      ]),
      true,
    );
    assert.equal(
      isPlatformOrAgentOperatorMemberships([
        { orgType: "merchant", role: "owner" },
      ]),
      false,
    );
  });
});

describe("payout and settlement authz updates", () => {
  const agentOrg = { id: "a1", type: "agent" };
  const merchant = { id: "m1", type: "merchant", parent_id: "a1" };

  it("platform operator may update agent payout", () => {
    assert.equal(
      canUpdateAgentPayout(
        { platformOperator: true, memberships: [] },
        agentOrg,
      ),
      true,
    );
  });

  it("merchant admin cannot change settlement; owner can", () => {
    assert.equal(
      canChangeSettlementSettings(
        {
          platformOperator: false,
          memberships: [{ orgId: "m1", role: "administrator", orgType: "merchant" }],
        },
        merchant,
      ),
      false,
    );
    assert.equal(
      canChangeSettlementSettings(
        {
          platformOperator: false,
          memberships: [{ orgId: "m1", role: "owner", orgType: "merchant" }],
        },
        merchant,
      ),
      true,
    );
  });

  it("agent O/A may onboard site under channel merchant", () => {
    assert.equal(
      canOnboardSiteUnderParent(
        {
          platformOperator: false,
          memberships: [{ orgId: "a1", role: "owner", orgType: "agent" }],
        },
        merchant,
      ),
      true,
    );
  });
});

describe("platform owner support settings", () => {
  it("only platformOwner may update owner settings", async () => {
    const { canUpdatePlatformOwnerSettings } = await import(
      "../src/orgs/role-policy.mjs"
    );
    assert.equal(
      canUpdatePlatformOwnerSettings({ platformOwner: true }),
      true,
    );
    assert.equal(
      canUpdatePlatformOwnerSettings({
        platformOwner: false,
        platformOperator: true,
      }),
      false,
    );
  });
});
