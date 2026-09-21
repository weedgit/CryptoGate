import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAX_AGENT_DEPTH } from "../src/orgs/org-accounts.mjs";
import { agentDepthOf, normalizeOrgName, orgNamesEqual, validateCreateOrg } from "../src/orgs/org-rules.mjs";

const platform = {
  id: "p1",
  type: "platform",
  parent_id: null,
  max_agent_depth: 2,
};

const agent = {
  id: "a1",
  type: "agent",
  parent_id: "p1",
};

const agentSub = {
  id: "a2",
  type: "agent_sub",
  parent_id: "a1",
};

const merchant = {
  id: "m1",
  type: "merchant",
  parent_id: "a1",
};

const byId = {
  p1: platform,
  a1: agent,
  a2: agentSub,
};

describe("org create rules", () => {
  it("creates platform with default max agent depth", () => {
    const r = validateCreateOrg(
      { type: "platform", name: "PaymentGate", parentId: "" },
      { parent: null, maxAgentDepth: 2, agentDepthOfParent: 0 },
    );
    assert.equal(r.ok, true);
    assert.equal(r.insert.maxAgentDepth, DEFAULT_MAX_AGENT_DEPTH);
    assert.equal(r.insert.parentId, null);
  });

  it("rejects agent under another agent (use agent_sub)", () => {
    const r = validateCreateOrg(
      { type: "agent", name: "Nested", parentId: "a1" },
      { parent: agent, maxAgentDepth: 2, agentDepthOfParent: 1 },
    );
    assert.equal(r.ok, false);
    assert.equal(r.status, 403);
    assert.equal(r.code, "invalid_parent");
  });

  it("rejects agent_sub create", () => {
    const r = validateCreateOrg(
      { type: "agent_sub", name: "ISO child", parentId: "a1" },
      { parent: agent, maxAgentDepth: 2, agentDepthOfParent: 1 },
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, "org_type_disabled");
  });

  it("allows merchant under agent", () => {
    const r = validateCreateOrg(
      {
        type: "merchant",
        name: "Hotel Group",
        parentId: "a1",
      },
      { parent: agent, maxAgentDepth: 2, agentDepthOfParent: 1 },
    );
    assert.equal(r.ok, true);
    assert.equal(r.insert.type, "merchant");
    assert.equal(r.insert.parentId, "a1");
  });

  it("allows merchant_site under any merchant", () => {
    const r = validateCreateOrg(
      { type: "merchant_site", name: "Downtown", parentId: "m1" },
      { parent: merchant, maxAgentDepth: 2, agentDepthOfParent: 1 },
    );
    assert.equal(r.ok, true);
    assert.equal(r.insert.type, "merchant_site");
    assert.equal(r.insert.parentId, "m1");
  });

  it("allows merchant_site under another site (nested, same type)", () => {
    const site = {
      id: "s1",
      type: "merchant_site",
      parent_id: "m1",
    };
    const r = validateCreateOrg(
      { type: "merchant_site", name: "Floor 2", parentId: "s1" },
      {
        parent: site,
        maxAgentDepth: 2,
        agentDepthOfParent: 1,
      },
    );
    assert.equal(r.ok, true);
    assert.equal(r.insert.type, "merchant_site");
    assert.equal(r.insert.parentId, "s1");
  });

  it("rejects merchant under agent_sub in Phase 1", () => {
    const r = validateCreateOrg(
      {
        type: "merchant",
        name: "Under Sub",
        parentId: "a2",
      },
      { parent: agentSub, maxAgentDepth: 2, agentDepthOfParent: 2 },
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, "invalid_parent");
  });

  it("allows merchant under platform", () => {
    const r = validateCreateOrg(
      {
        type: "merchant",
        name: "Direct Hotel",
        parentId: "p1",
      },
      { parent: platform, maxAgentDepth: 2, agentDepthOfParent: 0 },
    );
    assert.equal(r.ok, true);
    assert.equal(r.insert.parentId, "p1");
  });

  it("ignores legacy structure on create", () => {
    const r = validateCreateOrg(
      {
        type: "merchant",
        name: "Hotel",
        parentId: "a1",
        structure: "single_location",
      },
      { parent: agent, maxAgentDepth: 2, agentDepthOfParent: 1 },
    );
    assert.equal(r.ok, true);
    assert.equal(r.insert.structure, undefined);
  });

  it("counts agent depth on a parent chain", () => {
    assert.equal(agentDepthOf(agent, (id) => byId[id] ?? null), 1);
    assert.equal(agentDepthOf(agentSub, (id) => byId[id] ?? null), 2);
    assert.equal(agentDepthOf(platform, (id) => byId[id] ?? null), 0);
  });
});

describe("org sibling name normalization", () => {
  it("trims and lowercases for comparison", () => {
    assert.equal(normalizeOrgName("  TravelPay  "), "travelpay");
    assert.equal(orgNamesEqual("TravelPay", " travelpay "), true);
    assert.equal(orgNamesEqual("TravelPay", "Other"), false);
    assert.equal(orgNamesEqual("   ", "   "), false);
  });
});
