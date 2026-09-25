import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeCommissionAmount,
  isAgentCommissionCatchUpDay,
  isAgentCommissionInvoiceDay,
  paidPlatformFeeUsd,
  previousCommissionPeriodKey,
  shouldCreateCommissionInvoice,
} from "../src/commercial/commission-invoice-generate.mjs";

describe("agent commission invoice rules", () => {
  it("previousCommissionPeriodKey is prior UTC month", () => {
    assert.equal(
      previousCommissionPeriodKey(new Date("2026-04-10T00:00:00.000Z")),
      "2026-03",
    );
    assert.equal(
      previousCommissionPeriodKey(new Date("2026-01-10T00:00:00.000Z")),
      "2025-12",
    );
  });

  it("isAgentCommissionInvoiceDay matches day C", () => {
    const now = new Date("2026-04-10T00:00:00.000Z");
    assert.equal(isAgentCommissionInvoiceDay(now, 10), true);
    assert.equal(isAgentCommissionInvoiceDay(now, 11), false);
  });

  it("catch-up spans remittance window", () => {
    const onC = new Date("2026-04-10T12:00:00.000Z");
    const mid = new Date("2026-04-12T12:00:00.000Z");
    const after = new Date("2026-04-16T12:00:00.000Z");
    assert.equal(isAgentCommissionCatchUpDay(onC, 10, 15), true);
    assert.equal(isAgentCommissionCatchUpDay(mid, 10, 15), true);
    assert.equal(isAgentCommissionCatchUpDay(after, 10, 15), false);
  });

  it("paidPlatformFeeUsd is subscription + volume (credits / total do not matter)", () => {
    assert.equal(paidPlatformFeeUsd("49.00", "12.50"), 61.5);
    assert.equal(paidPlatformFeeUsd("49.00", "0.00"), 49);
    assert.equal(paidPlatformFeeUsd("0", "0"), 0);
    // Credit lowers total_amount only — commission still uses line amounts.
    const lines = paidPlatformFeeUsd("49.00", "12.50");
    const totalAfterCredit = 50; // e.g. $11.50 credit applied
    assert.equal(lines, 61.5);
    assert.notEqual(lines, totalAfterCredit);
  });

  it("computeCommissionAmount applies rate", () => {
    // 100 * 15% = 15
    assert.equal(computeCommissionAmount(100, "15"), 15);
    // 61.50 * 10% = 6.15
    assert.equal(computeCommissionAmount(61.5, "10"), 6.15);
  });

  it("shouldCreateCommissionInvoice skips zero amounts", () => {
    assert.equal(shouldCreateCommissionInvoice(0), false);
    assert.equal(shouldCreateCommissionInvoice("0.00"), false);
    assert.equal(shouldCreateCommissionInvoice(0.01), true);
    assert.equal(shouldCreateCommissionInvoice(15), true);
  });
});
