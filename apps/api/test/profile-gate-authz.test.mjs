import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPersonProfileComplete } from "../src/auth/org-setup.mjs";
import {
  canCompleteEmptySiteOnboarding,
  canSupportEditMemberAccount,
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

describe("team member email, phone, password, and verification support-edit", () => {
  it("platform Owner/Administrator only; org Owners cannot", () => {
    assert.equal(
      canSupportEditMemberAccount({ platformOperator: true, memberships: [] }),
      true,
    );
    for (const orgType of ["merchant", "agent", "merchant_site"]) {
      assert.equal(
        canSupportEditMemberAccount({
          platformOperator: false,
          memberships: [{ orgId: "o1", role: "owner", orgType }],
        }),
        false,
      );
    }
  });
});

describe("agent completes onboarding of an empty site", () => {
  const orgs = new Map([
    ["a1", { id: "a1", type: "agent", parent_id: "p1" }],
    ["m1", { id: "m1", type: "merchant", parent_id: "a1" }],
    ["s1", { id: "s1", type: "merchant_site", parent_id: "m1" }],
    ["m2", { id: "m2", type: "merchant", parent_id: "p1" }],
  ]);
  const findOrg = async (id) => orgs.get(id) ?? null;
  const agentOwner = {
    platformOperator: false,
    memberships: [{ orgId: "a1", role: "owner", orgType: "agent" }],
  };
  const newSite = (parentId) => ({ id: "new", type: "merchant_site", parent_id: parentId });

  it("allows first Owner invite / rollback under a channel merchant or nested site", async () => {
    assert.equal(await canCompleteEmptySiteOnboarding(agentOwner, newSite("m1"), 0, findOrg), true);
    assert.equal(await canCompleteEmptySiteOnboarding(agentOwner, newSite("s1"), 0, findOrg), true);
  });

  it("denies once the site has members, outside the channel, and for agent Viewers", async () => {
    assert.equal(await canCompleteEmptySiteOnboarding(agentOwner, newSite("m1"), 1, findOrg), false);
    assert.equal(await canCompleteEmptySiteOnboarding(agentOwner, newSite("m2"), 0, findOrg), false);
    const viewer = {
      platformOperator: false,
      memberships: [{ orgId: "a1", role: "viewer", orgType: "agent" }],
    };
    assert.equal(await canCompleteEmptySiteOnboarding(viewer, newSite("m1"), 0, findOrg), false);
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

  it("agent O/A may onboard under nested merchant_site via billing merchant", async () => {
    const { canOnboardSiteUnderParentAsync } = await import(
      "../src/orgs/role-policy.mjs"
    );
    const site = {
      id: "s1",
      type: "merchant_site",
      parent_id: "m1",
    };
    const orgs = {
      s1: site,
      m1: merchant,
      a1: agentOrg,
    };
    const findOrg = async (id) => orgs[id] ?? null;
    const caller = {
      platformOperator: false,
      memberships: [{ orgId: "a1", role: "administrator", orgType: "agent" }],
    };
    assert.equal(canOnboardSiteUnderParent(caller, site), false);
    assert.equal(
      await canOnboardSiteUnderParentAsync(caller, site, findOrg),
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
