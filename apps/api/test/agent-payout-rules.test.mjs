import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  agentPayoutAllowedOnOrgType,
  toAgentPayoutAddress,
  validateAgentPayoutBody,
} from "../src/commercial/agent-payout-rules.mjs";

describe("agent-payout rules", () => {
  it("allows agent org types only", () => {
    assert.equal(agentPayoutAllowedOnOrgType("agent"), true);
    assert.equal(agentPayoutAllowedOnOrgType("agent_sub"), true);
    assert.equal(agentPayoutAllowedOnOrgType("merchant"), false);
  });

  it("validates address body", () => {
    const ok = validateAgentPayoutBody({
      asset: "USDT",
      network: "tron",
      address: "TX7s39gK1p9ZqR5mY8bV2wXn5uH4kP9qR2",
    });
    assert.equal(ok.ok, true);
  });

  it("maps row to API shape", () => {
    const row = toAgentPayoutAddress({
      org_id: "a1",
      asset: "USDT",
      network: "tron",
      address: "TAddr",
      updated_at: new Date("2026-05-01T00:00:00.000Z"),
    });
    assert.equal(row.orgId, "a1");
    assert.equal(row.address, "TAddr");
    assert.equal(row.updatedAt, "2026-05-01T00:00:00.000Z");
  });
});
