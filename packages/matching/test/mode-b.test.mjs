/**
 * M1-32 — Mode B test scaffold (assign M2-40 + match M3-60).
 * Phase1 §2.8 collision slice also lives in acceptance-2.8.test.mjs.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assignModeB,
  assignOnCreate,
  majorToMinor,
  matchModeB,
  matchTransaction,
  MODE_B_CREATE_BLOCK_STATUSES,
} from "../dist/index.js";

const baseAssign = {
  merchantId: "m1",
  asset: "USDT",
  network: "tron",
  requestedAmount: "50.00",
  mainSettlementAddress: "TMainAddressExample",
};

const baseCandidate = {
  orderId: "ord-1",
  payableAmount: "50.00",
  receiveAddress: "TMainAddressExample",
  asset: "USDT",
  network: "tron",
};

const baseTx = {
  mode: "B",
  toAddress: "TMainAddressExample",
  amount: "50.00",
  asset: "USDT",
  network: "tron",
  txHash: "0xabc",
};

describe("@paymentgate/matching mode-b assign (M1-32 / M2-40)", () => {
  it("exports create-block statuses for open same-amount lock", () => {
    assert.deepEqual([...MODE_B_CREATE_BLOCK_STATUSES], [
      "pending_payment",
      "verifying",
      "confirmed",
    ]);
  });
  it("assigns main settlement address and payable = requested amount", async () => {
    const result = await assignModeB({ ...baseAssign, mode: "B" });
    assert.equal(result.receiveAddress, "TMainAddressExample");
    assert.equal(result.addressSource, "main");
    assert.equal(result.payableAmount.amount, "50.00");
    assert.equal(result.payableAmount.currency, "USDT");
    assert.equal(result.hdIndex, null);
    assert.equal(result.memoOrTag, null);
  });

  it("trims settlement address", async () => {
    const result = await assignModeB({
      ...baseAssign,
      mode: "B",
      mainSettlementAddress: "  TMainAddressExample  ",
    });
    assert.equal(result.receiveAddress, "TMainAddressExample");
  });

  it("assignOnCreate routes Mode B", async () => {
    const result = await assignOnCreate({ ...baseAssign, mode: "B" });
    assert.equal(result.receiveAddress, "TMainAddressExample");
    assert.equal(result.hdIndex, null);
  });

  it("rejects empty settlement address", async () => {
    await assert.rejects(
      () =>
        assignModeB({
          ...baseAssign,
          mode: "B",
          mainSettlementAddress: "   ",
        }),
      /mainSettlementAddress is required/,
    );
  });

  it("rejects whitespace inside settlement address", async () => {
    await assert.rejects(
      () =>
        assignModeB({
          ...baseAssign,
          mode: "B",
          mainSettlementAddress: "TMain Address",
        }),
      /must not contain whitespace/,
    );
  });

  it("rejects invalid requestedAmount format", async () => {
    await assert.rejects(
      () =>
        assignModeB({
          ...baseAssign,
          mode: "B",
          requestedAmount: "-1",
        }),
      /decimal string/,
    );
  });

  it("rejects amount below registry minAmount", async () => {
    await assert.rejects(
      () =>
        assignModeB({
          ...baseAssign,
          mode: "B",
          requestedAmount: "0.001",
        }),
      /below minAmount/,
    );
  });

  it("rejects unknown asset/network pair", async () => {
    await assert.rejects(
      () =>
        assignModeB({
          ...baseAssign,
          mode: "B",
          asset: "USDT",
          network: "bitcoin",
        }),
      /not enabled in registry/,
    );
  });

  it("rejects too many decimal places for USDT", async () => {
    await assert.rejects(
      () =>
        assignModeB({
          ...baseAssign,
          mode: "B",
          requestedAmount: "1.1234567",
        }),
      /decimal places/,
    );
  });

  it("rejects wrong mode on assignModeB", async () => {
    await assert.rejects(
      () => assignModeB({ ...baseAssign, mode: "C" }),
      /requires mode B/,
    );
  });

  it("majorToMinor respects decimals", () => {
    assert.equal(majorToMinor("50.01", 6), 50010000n);
    assert.equal(majorToMinor("0.01", 6), 10000n);
  });
});

describe("@paymentgate/matching mode-b match (M1-32 / M3-60)", () => {
  it("exact unique match → verifying", async () => {
    const result = await matchModeB({
      ...baseTx,
      candidates: [baseCandidate],
    });
    assert.equal(result.status, "verifying");
    assert.equal(result.orderId, "ord-1");
    assert.equal(result.reason, "mode_b_exact_match");
  });

  it("same-amount collision → payment_anomaly with all orderIds (never FIFO)", async () => {
    const result = await matchTransaction({
      ...baseTx,
      candidates: [baseCandidate, { ...baseCandidate, orderId: "ord-2" }],
    });
    assert.equal(result.status, "payment_anomaly");
    assert.deepEqual(result.orderIds, ["ord-1", "ord-2"]);
    assert.equal(result.orderId, undefined);
    assert.equal(result.reason, "mode_b_same_amount_collision");
  });

  it("treats equivalent decimals as the same payable", async () => {
    const result = await matchModeB({
      ...baseTx,
      amount: "50",
      candidates: [{ ...baseCandidate, payableAmount: "50.000000" }],
    });
    assert.equal(result.status, "verifying");
    assert.equal(result.orderId, "ord-1");
  });

  it("single open order underpay → anomaly", async () => {
    const result = await matchModeB({
      ...baseTx,
      amount: "49.00",
      candidates: [baseCandidate],
    });
    assert.equal(result.status, "payment_anomaly");
    assert.equal(result.orderId, "ord-1");
    assert.equal(result.reason, "mode_b_underpay");
  });

  it("single open order overpay → anomaly", async () => {
    const result = await matchModeB({
      ...baseTx,
      amount: "51.00",
      candidates: [baseCandidate],
    });
    assert.equal(result.status, "payment_anomaly");
    assert.equal(result.reason, "mode_b_overpay");
  });

  it("no candidates at address → pending (unmatched)", async () => {
    const result = await matchModeB({
      ...baseTx,
      candidates: [],
    });
    assert.equal(result.status, "pending_payment");
    assert.equal(result.reason, "no_open_order_at_address");
  });

  it("wrong receive address on candidates → pending", async () => {
    const result = await matchModeB({
      ...baseTx,
      candidates: [{ ...baseCandidate, receiveAddress: "TOtherAddress" }],
    });
    assert.equal(result.status, "pending_payment");
    assert.equal(result.reason, "no_open_order_at_address");
  });

  it("wrong network on candidate → pending", async () => {
    const result = await matchModeB({
      ...baseTx,
      candidates: [{ ...baseCandidate, network: "ethereum" }],
    });
    assert.equal(result.status, "pending_payment");
    assert.equal(result.reason, "no_open_order_at_address");
  });

  it("multiple wrong amounts with no exact match → pending", async () => {
    const result = await matchModeB({
      ...baseTx,
      amount: "49.00",
      candidates: [
        { ...baseCandidate, orderId: "ord-a", payableAmount: "50.00" },
        { ...baseCandidate, orderId: "ord-b", payableAmount: "51.00" },
      ],
    });
    assert.equal(result.status, "pending_payment");
    assert.equal(result.reason, "no_exact_amount_match");
  });

  it("late payment after expiry → anomaly", async () => {
    const result = await matchModeB({
      ...baseTx,
      nowMs: Date.parse("2026-08-24T12:00:00.000Z"),
      candidates: [
        {
          ...baseCandidate,
          expiresAt: "2026-08-24T11:00:00.000Z",
        },
      ],
    });
    assert.equal(result.status, "payment_anomaly");
    assert.equal(result.reason, "late_payment_after_expiry");
    assert.deepEqual(result.orderIds, ["ord-1"]);
  });

  it("requires candidates", async () => {
    await assert.rejects(() => matchModeB({ ...baseTx }), /candidates is required/);
  });

  it("requires txHash", async () => {
    await assert.rejects(
      () => matchModeB({ ...baseTx, txHash: "", candidates: [baseCandidate] }),
      /txHash is required/,
    );
  });

  it("rejects wrong mode on matchModeB", async () => {
    await assert.rejects(
      () =>
        matchModeB({
          ...baseTx,
          mode: "C",
          candidates: [baseCandidate],
        }),
      /match expects mode B/,
    );
  });
});
