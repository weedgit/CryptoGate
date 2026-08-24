import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assignModeB,
  assignModeC,
  assignModeD,
  assignModeS,
  assignOnCreate,
  matchTransaction,
} from "../dist/index.js";

const baseAssign = {
  merchantId: "m1",
  asset: "USDT",
  network: "tron",
  requestedAmount: "50.00",
  mainSettlementAddress: "TMainAddressExample",
};

describe("@cryptogate/matching M1-32 scaffold", () => {
  it("Mode B assigns main settlement address", async () => {
    const result = await assignModeB({ ...baseAssign, mode: "B" });
    assert.equal(result.receiveAddress, "TMainAddressExample");
    assert.equal(result.addressSource, "main");
    assert.equal(result.payableAmount.amount, "50.00");
    assert.equal(result.payableAmount.currency, "USDT");
  });

  it("assignOnCreate routes Mode B", async () => {
    const result = await assignOnCreate({ ...baseAssign, mode: "B" });
    assert.equal(result.receiveAddress, "TMainAddressExample");
  });

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
