import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addOneMonthUtcDateString,
  recurringVolumeWindow,
  toUtcDateString,
} from "../src/service-bills/billing-anchor-rules.mjs";
import {
  currentCommissionPeriodKey,
  defaultCommissionPeriodKey,
  isAgentCommissionCatchUpDay,
  isAgentCommissionInvoiceDay,
  paidPlatformFeeUsd,
  computeCommissionAmount,
  previousCommissionPeriodKey,
} from "../src/commercial/commission-invoice-generate.mjs";

describe("merchant recurring volume window", () => {
  it("uses [start, invoiceOn) and display end is day before invoiceOn", () => {
    const w = recurringVolumeWindow("2026-03-01", "2026-04-01");
    assert.equal(w.inclusiveStartIso, "2026-03-01T00:00:00.000Z");
    assert.equal(w.exclusiveEndIso, "2026-04-01T00:00:00.000Z");
    assert.equal(w.displayPeriodEnd, "2026-03-31");
  });

  it("clamps display end when invoiceOn equals start", () => {
    const w = recurringVolumeWindow("2026-03-15", "2026-03-15");
    assert.equal(w.displayPeriodEnd, "2026-03-15");
  });

  it("toUtcDateString normalizes Date and string", () => {
    assert.equal(toUtcDateString("2026-04-10"), "2026-04-10");
    assert.equal(
      toUtcDateString(new Date("2026-04-10T00:00:00.000Z")),
      "2026-04-10",
    );
    assert.equal(toUtcDateString(null), null);
  });

  it("activation paid → next invoice is +1 month (day clamp)", () => {
    assert.equal(
      addOneMonthUtcDateString("2026-03-31T12:00:00.000Z"),
      "2026-04-30",
    );
    assert.equal(
      addOneMonthUtcDateString("2026-01-31T12:00:00.000Z"),
      "2026-02-28",
    );
  });
});

describe("agent commission period + formula (review)", () => {
  it("default period is prior UTC month (matches day-C job)", () => {
    const now = new Date("2026-04-10T00:00:00.000Z");
    assert.equal(defaultCommissionPeriodKey(now), "2026-03");
    assert.equal(previousCommissionPeriodKey(now), "2026-03");
    assert.equal(currentCommissionPeriodKey(now), "2026-04");
  });

  it("day C + catch-up window gate", () => {
    const c = new Date("2026-04-10T00:00:00.000Z");
    assert.equal(isAgentCommissionInvoiceDay(c, 10), true);
    assert.equal(isAgentCommissionCatchUpDay(c, 10, 15), true);
    assert.equal(
      isAgentCommissionCatchUpDay(new Date("2026-04-09T00:00:00.000Z"), 10, 15),
      false,
    );
  });

  it("commission = (sub + volume) × rate; activation excluded by caller", () => {
    const base = paidPlatformFeeUsd("199.00", "40.00");
    assert.equal(base, 239);
    assert.equal(computeCommissionAmount(base, "15"), 35.85);
    // subscription-only month still counts
    assert.equal(computeCommissionAmount(paidPlatformFeeUsd("49.00", "0"), "10"), 4.9);
  });
});
