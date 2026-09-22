import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateCreateOrg } from "../src/orgs/org-rules.mjs";
import {
  isSetupAllowedMutation,
  isContactGatedRequest,
} from "../src/auth/contact-verification.mjs";
import {
  isPersonProfileComplete,
  loadOrgSetupStatus,
} from "../src/auth/org-setup.mjs";

describe("sub-agent removal", () => {
  it("rejects agent_sub creates with org_type_disabled", () => {
    const r = validateCreateOrg(
      { type: "agent_sub", name: "Nested", parentId: "a1" },
      {
        parent: { id: "a1", type: "agent", parent_id: "p1" },
        maxAgentDepth: 2,
        agentDepthOfParent: 1,
      },
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, "org_type_disabled");
  });
});

describe("setup gate allow-list", () => {
  it("keeps browse and setup mutations open", () => {
    assert.equal(isContactGatedRequest("GET", "/v1/orders"), false);
    assert.equal(isSetupAllowedMutation("PATCH", "/v1/orgs/x"), true);
    assert.equal(isSetupAllowedMutation("PUT", "/v1/orgs/x/settlement"), true);
    assert.equal(isSetupAllowedMutation("PUT", "/v1/orgs/x/agent-payout"), true);
    assert.equal(isSetupAllowedMutation("PATCH", "/v1/auth/profile"), true);
    assert.equal(
      isSetupAllowedMutation("POST", "/v1/auth/contact/email/send"),
      true,
    );
    assert.equal(isSetupAllowedMutation("POST", "/v1/orgs"), false);
  });
});

describe("person profile gate fields", () => {
  it("requires first and last name (not displayName alone)", () => {
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
        displayName: "Ada",
        timezone: "UTC",
      }),
      false,
    );
  });
});

describe("platform-only memberships", () => {
  it("marks setup ready when contact+person complete and no agent/merchant org", async () => {
    const setup = await loadOrgSetupStatus([], {
      emailVerified: true,
      phoneVerified: true,
      firstName: "Pat",
      lastName: "Owner",
      timezone: "UTC",
    });
    assert.equal(setup.setupReady, true);
    assert.equal(setup.profileComplete, true);
    assert.equal(setup.walletSet, true);
    assert.equal(setup.setupOrgId, null);
  });

  it("blocks when person incomplete even for platform-only", async () => {
    const setup = await loadOrgSetupStatus([], {
      emailVerified: true,
      phoneVerified: true,
      firstName: "Pat",
      lastName: "",
      timezone: "UTC",
    });
    assert.equal(setup.setupReady, false);
    assert.equal(setup.personComplete, false);
  });
});
