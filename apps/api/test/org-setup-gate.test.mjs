import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateCreateOrg } from "../src/orgs/org-rules.mjs";
import {
  isSetupAllowedMutation,
  isContactGatedRequest,
} from "../src/auth/contact-verification.mjs";
import {
  isPersonProfileComplete,
  isOrgProfileComplete,
  orgProfileMissingLabels,
  loadOrgSetupStatus,
} from "../src/auth/org-setup.mjs";

describe("sub-agent removal", () => {
  it("rejects agent_sub creates as unknown org type", () => {
    const r = validateCreateOrg(
      { type: "agent_sub", name: "Nested", parentId: "a1" },
      {
        parent: { id: "a1", type: "agent", parent_id: "p1" },
        maxAgentDepth: 1,
        agentDepthOfParent: 1,
      },
    );
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
    assert.equal(r.code, "invalid_org_type");
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

describe("org profile gate fields", () => {
  it("agent needs name + billing email; country optional", () => {
    assert.equal(
      isOrgProfileComplete(
        { name: "Acme", billing_email: "b@acme.example" },
        "agent",
      ),
      true,
    );
    assert.equal(
      isOrgProfileComplete({ name: "Acme", billing_email: "" }, "agent"),
      false,
    );
    assert.deepEqual(
      orgProfileMissingLabels({ name: "Acme", billing_email: "" }, "agent"),
      ["billing email"],
    );
  });

  it("merchant needs name + country + billing; missing is selective", () => {
    assert.equal(
      isOrgProfileComplete(
        {
          name: "Shop",
          country: "AU",
          billing_email: "b@shop.example",
        },
        "merchant",
      ),
      true,
    );
    assert.deepEqual(
      orgProfileMissingLabels(
        {
          name: "Shop",
          country: "",
          billing_email: "b@shop.example",
        },
        "merchant",
      ),
      ["country"],
    );
    assert.deepEqual(
      orgProfileMissingLabels(
        { name: "S", country: "AU", billing_email: "x" },
        "merchant",
      ),
      ["business name", "billing email"],
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
