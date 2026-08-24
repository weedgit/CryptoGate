import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  amountToMinor,
  extraCreateOrderKeys,
  STUB_RECEIVE_ADDRESS,
  stubAssignOnCreate,
  validateCreateOrderBody,
} from "../src/orders/order-rules.mjs";

describe("order create rules", () => {
  it("rejects privileged matching fields", () => {
    const { privileged } = extraCreateOrderKeys({
      amount: "1.00",
      matchingMode: "B",
      receiveAddress: "Txxx",
    });
    assert.deepEqual(privileged.sort(), ["matchingMode", "receiveAddress"]);
  });

  it("accepts USDT on Tron at or above min amount", () => {
    const r = validateCreateOrderBody({
      amount: "0.01",
      asset: "USDT",
      network: "tron",
      validitySeconds: 900,
    });
    assert.equal(r.ok, true);
    assert.equal(r.parsed.config.requiredConfirmations, 19);
  });

  it("rejects disabled asset/network with 422", () => {
    const r = validateCreateOrderBody({
      amount: "10.00",
      asset: "USDT",
      network: "ethereum",
      validitySeconds: 900,
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, 422);
    assert.equal(r.code, "asset_network_disabled");
  });

  it("rejects short validity and over-decimal amounts", () => {
    assert.equal(
      validateCreateOrderBody({
        amount: "1.00",
        asset: "USDT",
        network: "tron",
        validitySeconds: 30,
      }).code,
      "invalid_request",
    );
    assert.equal(
      validateCreateOrderBody({
        amount: "1.1234567",
        asset: "USDT",
        network: "tron",
        validitySeconds: 60,
      }).code,
      "invalid_amount",
    );
  });

  it("converts amounts to minor units without float", () => {
    assert.equal(amountToMinor("1.50", 6), 1500000n);
    assert.equal(amountToMinor("0.01", 6), 10000n);
    assert.equal(amountToMinor("1.1234567", 6), null);
  });

  it("stubs Mode B assign with a non-live receive address", () => {
    const assign = stubAssignOnCreate({
      amount: "245.00",
      asset: "USDT",
      config: { requiredConfirmations: 19 },
    });
    assert.equal(assign.matchingMode, "B");
    assert.equal(assign.addressSource, "main");
    assert.equal(assign.receiveAddress, STUB_RECEIVE_ADDRESS);
    assert.equal(assign.payableAmount.amount, "245.00");
    assert.equal(assign.hdIndex, null);
    assert.equal(assign.requiredConfirmations, 19);
  });
});
