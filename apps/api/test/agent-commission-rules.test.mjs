import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseCommissionPercent,
  validateUpdateAgentCommissionBody,
} from "../src/commercial/agent-commission-rules.mjs";

describe("agent commission rules", () => {
  it("parses valid percents", () => {
    assert.equal(parseCommissionPercent("15"), "15");
    assert.equal(parseCommissionPercent("12.5"), "12.5");
    assert.equal(parseCommissionPercent("0"), "0");
    assert.equal(parseCommissionPercent("100"), "100");
  });

  it("rejects out of range", () => {
    assert.equal(parseCommissionPercent("-1"), null);
    assert.equal(parseCommissionPercent("101"), null);
    assert.equal(parseCommissionPercent(""), null);
  });

  it("validates update body", () => {
    const ok = validateUpdateAgentCommissionBody({ commissionPercent: "18" });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.commissionPercent, "18");

    const bad = validateUpdateAgentCommissionBody({ commissionPercent: "x" });
    assert.equal(bad.ok, false);
  });
});
