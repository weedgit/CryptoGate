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

  it("validates address body requires MFA", () => {
    const prev = process.env.CRYPTOGATE_CHAIN_ENV;
    process.env.CRYPTOGATE_CHAIN_ENV = "mainnet";
    const missing = validateAgentPayoutBody({
      asset: "USDT",
      network: "tron",
      address: "TX7s39gK1p9ZqR5mY8bV2wXn5uH4kP9qR2",
    });
    assert.equal(missing.ok, false);

    const ok = validateAgentPayoutBody({
      asset: "USDT",
      network: "tron",
      address: "TX7s39gK1p9ZqR5mY8bV2wXn5uH4kP9qR2",
      mfaCode: "123456",
    });
    assert.equal(ok.ok, true);
    if (prev === undefined) delete process.env.CRYPTOGATE_CHAIN_ENV;
    else process.env.CRYPTOGATE_CHAIN_ENV = prev;
  });

  it("accepts tron_nile for platform fee pair in testnet", () => {
    const prev = process.env.CRYPTOGATE_CHAIN_ENV;
    process.env.CRYPTOGATE_CHAIN_ENV = "testnet";
    const ok = validateAgentPayoutBody({
      asset: "USDT",
      network: "tron_nile",
      address: "TX7s39gK1p9ZqR5mY8bV2wXn5uH4kP9qR2",
      mfaCode: "123456",
    });
    assert.equal(ok.ok, true);
    const mainnetPair = validateAgentPayoutBody({
      asset: "USDT",
      network: "tron",
      address: "TX7s39gK1p9ZqR5mY8bV2wXn5uH4kP9qR2",
      mfaCode: "123456",
    });
    assert.equal(mainnetPair.ok, false);
    if (prev === undefined) delete process.env.CRYPTOGATE_CHAIN_ENV;
    else process.env.CRYPTOGATE_CHAIN_ENV = prev;
  });

  it("rejects non-tron payout asset", () => {
    const eth = validateAgentPayoutBody({
      asset: "USDT",
      network: "ethereum",
      address: "0x0000000000000000000000000000000000000001",
      mfaCode: "123456",
    });
    assert.equal(eth.ok, false);
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
