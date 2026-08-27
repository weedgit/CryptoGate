import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateComplianceOverrideBody,
  toComplianceOverride,
} from "../src/compliance/compliance-rules.mjs";
import { canComplianceOverride } from "../src/orgs/role-policy.mjs";

describe("compliance override rules", () => {
  it("requires MFA, notes, and typed payload", () => {
    const bad = validateComplianceOverrideBody({
      overrideType: "suspend_merchant",
      reasonCode: "manual_review",
      notes: "short",
      mfaCode: "123456",
    });
    assert.equal(bad.ok, false);

    const ok = validateComplianceOverrideBody({
      overrideType: "suspend_merchant",
      reasonCode: "manual_review",
      notes: "Suspicious activity flagged via watch node for review.",
      mfaCode: "123456",
      ticketId: "CASE-42",
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.parsed.ticketId, "CASE-42");
  });

  it("requires settlement payload for settlement_address", () => {
    const missing = validateComplianceOverrideBody({
      overrideType: "settlement_address",
      reasonCode: "other",
      notes: "Force settlement address after sanctions check.",
      mfaCode: "123456",
    });
    assert.equal(missing.ok, false);

    const ok = validateComplianceOverrideBody({
      overrideType: "settlement_address",
      reasonCode: "other",
      notes: "Force settlement address after sanctions check.",
      mfaCode: "123456",
      settlement: {
        asset: "USDT",
        network: "tron",
        address: "TXyz1234567890abcdef",
      },
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.parsed.settlement?.network, "tron");
  });

  it("requires matchingMode for matching_mode", () => {
    const missing = validateComplianceOverrideBody({
      overrideType: "matching_mode",
      reasonCode: "manual_review",
      notes: "Switch merchant to Mode B pending HD xPub fix.",
      mfaCode: "123456",
    });
    assert.equal(missing.ok, false);

    const ok = validateComplianceOverrideBody({
      overrideType: "matching_mode",
      reasonCode: "manual_review",
      notes: "Switch merchant to Mode B pending HD xPub fix.",
      mfaCode: "123456",
      matchingMode: "B",
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.parsed.matchingMode, "B");
  });

  it("maps DB rows to API shape", () => {
    const row = toComplianceOverride({
      id: "o1",
      org_id: "m1",
      actor_user_id: "u1",
      override_type: "suspend_merchant",
      reason_code: "manual_review",
      notes: "Hold settlement gateway",
      ticket_id: null,
      metadata: { status: "paused" },
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    });
    assert.equal(row.orgId, "m1");
    assert.equal(row.overrideType, "suspend_merchant");
    assert.equal(row.createdAt, "2026-01-01T00:00:00.000Z");
  });
});

describe("compliance override policy", () => {
  it("allows platform operators only", () => {
    assert.equal(canComplianceOverride({ platformOperator: true }), true);
    assert.equal(canComplianceOverride({ platformOperator: false }), false);
  });
});
