import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignModeB } from "../dist/mode-b/index.js";

describe("@cryptogate/matching stubs", () => {
  it("Mode B assigns main settlement address", async () => {
    const result = await assignModeB({
      mode: "B",
      merchantId: "m1",
      asset: "USDT",
      network: "tron",
      requestedAmount: "50.00",
      mainSettlementAddress: "TMainAddressExample",
    });
    assert.equal(result.receiveAddress, "TMainAddressExample");
    assert.equal(result.addressSource, "main");
    assert.equal(result.payableAmount.amount, "50.00");
  });
});
