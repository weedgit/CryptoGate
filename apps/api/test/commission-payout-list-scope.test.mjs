import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scopedCommissionPayoutListFilter } from "../src/commercial/commission-payout-rules.mjs";

const AGENT = "agent-1";
const SUB = "sub-1";

describe("scopedCommissionPayoutListFilter", () => {
  it("lists platform invoices as payee for the caller org", () => {
    const scoped = scopedCommissionPayoutListFilter([AGENT], {
      payer: "platform",
      payeeOrgId: AGENT,
    });
    assert.equal(scoped.ok, true);
    if (scoped.ok) {
      assert.deepEqual(scoped.filter, {
        payer: "platform",
        payeeOrgId: AGENT,
      });
    }
  });

  it("rejects platform invoices for another agent", () => {
    const scoped = scopedCommissionPayoutListFilter([AGENT], {
      payer: "platform",
      payeeOrgId: SUB,
    });
    assert.equal(scoped.ok, false);
  });

  it("lists parent → sub slips when the sub-agent queries as payee", () => {
    const scoped = scopedCommissionPayoutListFilter([SUB], {
      payer: "agent",
      payeeOrgId: SUB,
    });
    assert.equal(scoped.ok, true);
    if (scoped.ok) {
      assert.equal(scoped.filter.payer, "agent");
      assert.equal(scoped.filter.payeeOrgId, SUB);
      assert.equal(scoped.filter.payerOrgId, undefined);
    }
  });

  it("lists agent → sub slips the parent issued", () => {
    const scoped = scopedCommissionPayoutListFilter([AGENT], {
      payer: "agent",
      payerOrgId: AGENT,
    });
    assert.equal(scoped.ok, true);
    if (scoped.ok) {
      assert.deepEqual(scoped.filter, {
        payer: "agent",
        payerOrgId: AGENT,
      });
    }
  });
});
