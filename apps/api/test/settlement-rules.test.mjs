import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  settlementAllowedOnOrgType,
  settlementAssetsForNetwork,
  toSettlementAddress,
  validateSettlementBody,
} from "../src/settlement/settlement-rules.mjs";

describe("settlement rules", () => {
  it("allows settlement only on merchant orgs", () => {
    assert.equal(settlementAllowedOnOrgType("merchant"), true);
    assert.equal(settlementAllowedOnOrgType("merchant_site"), true);
    assert.equal(settlementAllowedOnOrgType("agent"), false);
    assert.equal(settlementAllowedOnOrgType("platform"), false);
  });

  it("accepts USDT on Tron with MFA code", () => {
    const r = validateSettlementBody({
      asset: "USDT",
      network: "tron",
      address: "TPaymentGateStubReceiveAddress00001",
      mfaCode: "123456",
    });
    assert.equal(r.ok, true);
    assert.equal(r.parsed.address, "TPaymentGateStubReceiveAddress00001");
    assert.equal(r.parsed.mfaCode, "123456");
  });

  it("requires mfaCode for settlement changes", () => {
    const r = validateSettlementBody({
      asset: "USDT",
      network: "tron",
      address: "TPaymentGateStubReceiveAddress00001",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "mfa_required");
  });

  it("rejects whitespace in the address", () => {
    const r = validateSettlementBody({
      asset: "USDT",
      network: "tron",
      address: "Txxx yyy",
      mfaCode: "123456",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "invalid_address");
  });

  it("rejects unknown asset/network with 422", () => {
    const r = validateSettlementBody({
      asset: "USDT",
      network: "not_a_network",
      address: "0xabc1234567890123456789012345678901234",
      mfaCode: "123456",
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, 422);
    assert.equal(r.code, "asset_network_disabled");
  });

  it("accepts live USDT on Ethereum settlement", () => {
    const r = validateSettlementBody({
      asset: "USDT",
      network: "ethereum",
      address: "0xabc1234567890123456789012345678901234",
      mfaCode: "123456",
    });
    assert.equal(r.ok, true);
  });

  it("one wallet per network: asset is optional and covers every live asset", () => {
    const tron = validateSettlementBody({
      network: "tron",
      address: "TPaymentGateStubReceiveAddress00001",
      mfaCode: "123456",
    });
    assert.equal(tron.ok, true);
    assert.deepEqual([...tron.parsed.assets].sort(), ["TRX", "USDT"]);

    const eth = validateSettlementBody({
      asset: "USDT",
      network: "ethereum",
      address: "0xabc1234567890123456789012345678901234",
      mfaCode: "123456",
    });
    assert.equal(eth.ok, true);
    assert.deepEqual([...eth.parsed.assets].sort(), ["ETH", "USDC", "USDT"]);
    assert.equal(eth.parsed.asset, "USDT");

    assert.deepEqual([...settlementAssetsForNetwork("solana")].sort(), ["USDC", "USDT"]);
    assert.deepEqual(settlementAssetsForNetwork("not_a_network"), []);
  });

  it("maps pending cool-down onto the API shape", () => {
    const mapped = toSettlementAddress({
      org_id: "org-1",
      asset: "USDT",
      network: "tron",
      address: "TActiveAddress00000000000000000001",
      pending_address: "TPendingAddress000000000000000001",
      pending_activates_at: "2026-08-25T12:00:00.000Z",
    });
    assert.equal(mapped.status, "pending_cool_down");
    assert.equal(mapped.pendingAddress, "TPendingAddress000000000000000001");
    assert.equal(mapped.address, "TActiveAddress00000000000000000001");
  });
});
