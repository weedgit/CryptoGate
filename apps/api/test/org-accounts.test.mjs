import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MAX_AGENT_DEPTH,
  ORG_TYPES,
  toOrgAccount,
} from "../src/orgs/org-accounts.mjs";

describe("org-accounts mapper", () => {
  it("uses domain org types", () => {
    assert.deepEqual(ORG_TYPES, [
      "platform",
      "agent",
      "agent_sub",
      "merchant",
      "merchant_site",
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
      status: "active",
      created_at: new Date("2025-11-15T12:00:00.000Z"),
    });
    assert.equal(account.createdAt, "2025-11-15T12:00:00.000Z");
  });

  it("maps merchant rows without structure", () => {
    const account = toOrgAccount({
      id: "m1",
      type: "merchant",
      name: "Hotel",
      parent_id: "a1",
    });
    assert.equal(account.parentId, "a1");
    assert.equal(account.structure, undefined);
  });

  it("maps registration profile fields when present", () => {
    const account = toOrgAccount({
      id: "a1",
      type: "agent",
      name: "Demo Agent",
      parent_id: "p1",
      country: "Singapore",
      legal_name: "Demo Agent Pte Ltd",
      billing_email: "billing@demo.example",
    });
    assert.equal(account.country, "Singapore");
    assert.equal(account.legalName, "Demo Agent Pte Ltd");
    assert.equal(account.billingEmail, "billing@demo.example");
  });
});
