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

  it("rejects unknown asset/network with 422", () => {
    const r = validateCreateOrderBody({
      amount: "10.00",
      asset: "USDT",
      network: "bitcoin",
      validitySeconds: 900,
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, 422);
    assert.equal(r.code, "asset_network_disabled");
  });

  it("accepts live USDT on Ethereum", () => {
    const r = validateCreateOrderBody({
      amount: "0.01",
      asset: "USDT",
      network: "ethereum",
      validitySeconds: 900,
    });
    assert.equal(r.ok, true);
    assert.equal(r.parsed.config.requiredConfirmations, 12);
  });

  it("accepts live BTC on Bitcoin", () => {
    const r = validateCreateOrderBody({
      amount: "0.0001",
      asset: "BTC",
      network: "bitcoin",
      validitySeconds: 900,
    });
    assert.equal(r.ok, true);
    assert.equal(r.parsed.config.requiredConfirmations, 3);
  });

  it("rejects tron_nile when chain env is mainnet (product default)", () => {
    const prev = process.env.CRYPTOGATE_CHAIN_ENV;
    process.env.CRYPTOGATE_CHAIN_ENV = "mainnet";
    try {
      const r = validateCreateOrderBody({
        amount: "1.00",
        asset: "USDT",
        network: "tron_nile",
        validitySeconds: 900,
      });
      assert.equal(r.ok, false);
      assert.equal(r.code, "asset_network_disabled");
    } finally {
      if (prev === undefined) delete process.env.CRYPTOGATE_CHAIN_ENV;
      else process.env.CRYPTOGATE_CHAIN_ENV = prev;
    }
  });

  it("accepts tron_nile when CRYPTOGATE_CHAIN_ENV=testnet", () => {
    const prev = process.env.CRYPTOGATE_CHAIN_ENV;
    process.env.CRYPTOGATE_CHAIN_ENV = "testnet";
    try {
      const r = validateCreateOrderBody({
        amount: "0.01",
        asset: "USDT",
        network: "tron_nile",
        validitySeconds: 900,
      });
      assert.equal(r.ok, true);
      assert.equal(r.parsed.config.displayNetwork, "TRON Nile (testnet)");
    } finally {
      if (prev === undefined) delete process.env.CRYPTOGATE_CHAIN_ENV;
      else process.env.CRYPTOGATE_CHAIN_ENV = prev;
    }
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

  it("stubs assign and locks the merchant matching mode", () => {
    const assign = stubAssignOnCreate({
      amount: "245.00",
      asset: "USDT",
      matchingMode: "C",
      config: { requiredConfirmations: 19 },
    });
    assert.equal(assign.matchingMode, "C");
    assert.equal(assign.addressSource, "main");
    assert.equal(assign.receiveAddress, STUB_RECEIVE_ADDRESS);
    assert.equal(assign.payableAmount.amount, "245.00");
    assert.equal(assign.hdIndex, null);
    assert.equal(assign.requiredConfirmations, 19);
  });
});
