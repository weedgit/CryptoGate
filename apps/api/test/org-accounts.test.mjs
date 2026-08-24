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
        name: "CryptoGate",
        parent_id: null,
        structure: null,
      }),
      {
        id: "p1",
        type: "platform",
        name: "CryptoGate",
        parentId: null,
      },
    );
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
});
