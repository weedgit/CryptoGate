import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  feeAccruedFromBills,
  serviceBillInPeriod,
} from "../src/platform/dashboardBillPeriod.ts";

const from = new Date("2026-08-26T00:00:00.000Z");
const to = new Date("2026-09-01T23:59:59.999Z");

describe("dashboardBillPeriod", () => {
  it("includes bills issued in the dashboard window", () => {
    const bill = {
      id: "b1",
      orgId: "o1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      subscriptionAmount: "0",
      volumeFeeAmount: "5.32",
      totalAmount: "5.32",
      currency: "USD",
      status: "issued",
      dueAt: "2026-09-14T12:00:00.000Z",
      createdAt: "2026-09-01T04:08:38.173Z",
    };
    assert.equal(serviceBillInPeriod(bill, from, to), true);
    assert.equal(feeAccruedFromBills([bill], from, to), 5.32);
  });

  it("excludes monthly bills outside issue/due/period overlap", () => {
    const bill = {
      id: "b2",
      orgId: "o1",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      subscriptionAmount: "0",
      volumeFeeAmount: "100.00",
      totalAmount: "100.00",
      currency: "USD",
      status: "paid",
      dueAt: "2026-07-15T12:00:00.000Z",
      createdAt: "2026-07-01T12:00:00.000Z",
      paidAt: "2026-07-10T12:00:00.000Z",
    };
    assert.equal(serviceBillInPeriod(bill, from, to), false);
    assert.equal(feeAccruedFromBills([bill], from, to), 0);
  });
});
