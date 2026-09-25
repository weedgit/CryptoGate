import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scopedCommissionPayoutListFilter } from "../src/commercial/commission-payout-rules.mjs";

const AGENT = "agent-1";
const OTHER = "agent-2";

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

  it("defaults payee to first agent org when omitted", () => {
    const scoped = scopedCommissionPayoutListFilter([AGENT], {
      payer: "platform",
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
      payeeOrgId: OTHER,
    });
    assert.equal(scoped.ok, false);
  });

  it("rejects agent payer (cascade removed)", () => {
    const scoped = scopedCommissionPayoutListFilter([AGENT], {
      payer: "agent",
      payeeOrgId: AGENT,
    });
    assert.equal(scoped.ok, false);
    if (!scoped.ok) assert.equal(scoped.status, 403);
  });

  it("rejects payerOrgId for agent callers", () => {
    const scoped = scopedCommissionPayoutListFilter([AGENT], {
      payer: "platform",
      payerOrgId: AGENT,
    });
    assert.equal(scoped.ok, false);
  });
});
