import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateCreateOrg } from "../src/orgs/org-rules.mjs";
import {
  isSetupAllowedMutation,
  isContactGatedRequest,
} from "../src/auth/contact-verification.mjs";

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
    assert.equal(isSetupAllowedMutation("POST", "/v1/orgs"), false);
  });
});
