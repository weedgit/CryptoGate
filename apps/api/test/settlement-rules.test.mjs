import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  settlementAllowedOnOrgType,
  validateSettlementBody,
} from "../src/settlement/settlement-rules.mjs";

describe("settlement rules", () => {
  it("allows settlement only on merchant orgs", () => {
    assert.equal(settlementAllowedOnOrgType("merchant"), true);
    assert.equal(settlementAllowedOnOrgType("merchant_site"), true);
    assert.equal(settlementAllowedOnOrgType("agent"), false);
    assert.equal(settlementAllowedOnOrgType("platform"), false);
  });

  it("accepts USDT on Tron with a trimmed address", () => {
    const r = validateSettlementBody({
      asset: "USDT",
      network: "tron",
      address: "TCryptoGateStubReceiveAddress00001",
    });
    assert.equal(r.ok, true);
    assert.equal(r.parsed.address, "TCryptoGateStubReceiveAddress00001");
  });

  it("rejects whitespace in the address", () => {
    const r = validateSettlementBody({
      asset: "USDT",
      network: "tron",
      address: "Txxx yyy",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "invalid_address");
  });

  it("rejects disabled asset/network with 422", () => {
    const r = validateSettlementBody({
      asset: "USDT",
      network: "ethereum",
      address: "0xabc",
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, 422);
    assert.equal(r.code, "asset_network_disabled");
  });
});
