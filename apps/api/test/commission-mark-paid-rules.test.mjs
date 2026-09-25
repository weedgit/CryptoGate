import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateMarkPaidBody } from "../src/commercial/commission-payout-rules.mjs";

describe("commission mark-paid body", () => {
  it("accepts note with optional txRef", () => {
    const r = validateMarkPaidBody({
      note: "Remitted via treasury",
      txRef: "0xabc123",
    });
    assert.equal(r.ok, true);
    assert.equal(r.parsed.note, "Remitted via treasury");
    assert.equal(r.parsed.txRef, "0xabc123");
  });

  it("allows empty txRef", () => {
    const r = validateMarkPaidBody({ note: "Paid offline" });
    assert.equal(r.ok, true);
    assert.equal(r.parsed.txRef, null);
  });

  it("rejects oversized txRef", () => {
    const r = validateMarkPaidBody({
      note: "ok",
      txRef: "x".repeat(201),
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "invalid_request");
  });
});
