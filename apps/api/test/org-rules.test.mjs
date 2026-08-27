import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAX_AGENT_DEPTH } from "../src/orgs/org-accounts.mjs";
import { agentDepthOf, normalizeOrgName, orgNamesEqual, validateCreateOrg } from "../src/orgs/org-rules.mjs";

const platform = {
  id: "p1",
  type: "platform",
  parent_id: null,
  structure: null,
  max_agent_depth: 2,
};

const agent = {
  id: "a1",
  type: "agent",
  parent_id: "p1",
  structure: null,
};

const agentSub = {
  id: "a2",
  type: "agent_sub",
  parent_id: "a1",
  structure: null,
};

const merchantMulti = {
  id: "m1",
  type: "merchant",
  parent_id: "a1",
  structure: "multi_location",
};

const byId = {
  p1: platform,
  a1: agent,
  a2: agentSub,
};

describe("org create rules", () => {
  it("creates platform with default max agent depth", () => {
    const r = validateCreateOrg(
      { type: "platform", name: "CryptoGate", parentId: "" },
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

  it("rejects agent_sub when max depth is exceeded", () => {
    const r = validateCreateOrg(
      { type: "agent_sub", name: "Too deep", parentId: "a2" },
      { parent: agentSub, maxAgentDepth: 2, agentDepthOfParent: 2 },
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, "agent_depth_exceeded");
  });

  it("allows agent_sub under agent within depth", () => {
    const r = validateCreateOrg(
      { type: "agent_sub", name: "ISO child", parentId: "a1" },
      { parent: agent, maxAgentDepth: 2, agentDepthOfParent: 1 },
    );
    assert.equal(r.ok, true);
  });

  it("requires merchant structure", () => {
    const r = validateCreateOrg(
      { type: "merchant", name: "Hotel", parentId: "a1" },
      { parent: agent, maxAgentDepth: 2, agentDepthOfParent: 1 },
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, "invalid_structure");
  });

  it("rejects merchant_site under single-location merchant", () => {
    const r = validateCreateOrg(
      { type: "merchant_site", name: "Downtown", parentId: "m1" },
      {
        parent: { ...merchantMulti, structure: "single_location" },
        maxAgentDepth: 2,
        agentDepthOfParent: 1,
      },
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, "invalid_parent");
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
