import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assignModeB,
  assignModeC,
  assignModeD,
  assignModeS,
  assignOnCreate,
  majorToMinor,
  matchTransaction,
} from "../dist/index.js";

const baseAssign = {
  merchantId: "m1",
  asset: "USDT",
  network: "tron",
  requestedAmount: "50.00",
  mainSettlementAddress: "TMainAddressExample",
};

describe("@cryptogate/matching Mode B assign (M2-40)", () => {
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
          network: "ethereum",
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

  it("majorToMinor respects decimals", () => {
    assert.equal(majorToMinor("50.01", 6), 50010000n);
    assert.equal(majorToMinor("0.01", 6), 10000n);
  });
});

describe("@cryptogate/matching M1-32 stubs", () => {
  it("Mode C assign is not implemented yet (M2-41)", async () => {
    await assert.rejects(
      () => assignModeC({ ...baseAssign, mode: "C" }),
      /M2-41/,
    );
  });

  it("Mode D assign is not implemented yet (M2-42)", async () => {
    await assert.rejects(
      () => assignModeD({ ...baseAssign, mode: "D" }),
      /M2-42/,
    );
  });

  it("Mode S assign is not implemented yet (M2-43)", async () => {
    await assert.rejects(
      () => assignModeS({ ...baseAssign, mode: "S" }),
      /M2-43/,
    );
  });

  it("assignOnCreate routes Mode C/D/S to stubs that throw", async () => {
    await assert.rejects(() => assignOnCreate({ ...baseAssign, mode: "C" }), /M2-41/);
    await assert.rejects(() => assignOnCreate({ ...baseAssign, mode: "D" }), /M2-42/);
    await assert.rejects(() => assignOnCreate({ ...baseAssign, mode: "S" }), /M2-43/);
  });

  it("matchTransaction is a Pending Payment stub until M3", async () => {
    const result = await matchTransaction({
      mode: "B",
      toAddress: "TMainAddressExample",
      amount: "50.00",
      asset: "USDT",
      network: "tron",
      txHash: "0xdead",
    });
    assert.equal(result.status, "pending_payment");
    assert.match(result.reason ?? "", /M3/);
  });
});
