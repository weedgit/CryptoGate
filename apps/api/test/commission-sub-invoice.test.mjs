import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parentPayoutAllowsSubInvoices } from "../src/commercial/commission-payout-rules.mjs";
import { directChildAgents } from "../src/commercial/commission-invoice-generate.mjs";

describe("parentPayoutAllowsSubInvoices", () => {
  it("allows issuing after paid or settled", () => {
    assert.equal(parentPayoutAllowsSubInvoices("paid"), true);
    assert.equal(parentPayoutAllowsSubInvoices("settled"), true);
  });

  it("blocks issuing before the parent received funds", () => {
    assert.equal(parentPayoutAllowsSubInvoices("issued"), false);
    assert.equal(parentPayoutAllowsSubInvoices("ready"), false);
    assert.equal(parentPayoutAllowsSubInvoices("verifying"), false);
    assert.equal(parentPayoutAllowsSubInvoices(null), false);
  });
});

describe("directChildAgents", () => {
  it("returns only immediate agent children", () => {
    const parent = "p1";
    const orgs = [
      { id: "s1", parent_id: parent, type: "agent_sub", name: "Sub" },
      { id: "s2", parent_id: parent, type: "agent", name: "Nested" },
      { id: "m1", parent_id: parent, type: "merchant", name: "Merchant" },
      { id: "s3", parent_id: "s1", type: "agent_sub", name: "Grandchild" },
    ];
    const kids = directChildAgents(orgs, parent);
    assert.equal(kids.length, 2);
    assert.deepEqual(
      kids.map((k) => k.id).sort(),
      ["s1", "s2"],
    );
  });
});
