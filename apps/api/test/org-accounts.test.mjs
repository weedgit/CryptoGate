import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MAX_AGENT_DEPTH,
  MERCHANT_STRUCTURES,
  ORG_TYPES,
  toOrgAccount,
} from "../src/orgs/org-accounts.mjs";

describe("org-accounts mapper", () => {
  it("uses domain org types and OpenAPI merchant structures", () => {
    assert.deepEqual(ORG_TYPES, [
      "platform",
      "agent",
      "agent_sub",
      "merchant",
      "merchant_site",
    ]);
    assert.deepEqual(MERCHANT_STRUCTURES, [
      "single_location",
      "multi_location",
    ]);
    assert.equal(DEFAULT_MAX_AGENT_DEPTH, 2);
  });

  it("maps platform row with null parentId", () => {
    assert.deepEqual(
      toOrgAccount({
        id: "p1",
        type: "platform",
        name: "PaymentGate",
        parent_id: null,
        structure: null,
      }),
      {
        id: "p1",
        type: "platform",
        name: "PaymentGate",
        parentId: null,
        status: "active",
      },
    );
  });

  it("maps created_at to createdAt ISO string", () => {
    const account = toOrgAccount({
      id: "a1",
      type: "agent",
      name: "Load Agent 003",
      parent_id: "p1",
      structure: null,
      status: "active",
      created_at: new Date("2025-11-15T12:00:00.000Z"),
    });
    assert.equal(account.createdAt, "2025-11-15T12:00:00.000Z");
  });

  it("includes structure on merchant rows", () => {
    const account = toOrgAccount({
      id: "m1",
      type: "merchant",
      name: "Hotel",
      parent_id: "a1",
      structure: "single_location",
    });
    assert.equal(account.parentId, "a1");
    assert.equal(account.structure, "single_location");
  });

  it("maps registration profile fields when present", () => {
    const account = toOrgAccount({
      id: "a1",
      type: "agent",
      name: "Demo Agent",
      parent_id: "p1",
      structure: null,
      country: "Singapore",
      legal_name: "Demo Agent Pte Ltd",
    });
    assert.equal(account.country, "Singapore");
    assert.equal(account.legalName, "Demo Agent Pte Ltd");
  });
});
