import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  commissionHistoryFromBills,
  paidPlatformFeeFromBill,
} from "../src/commercial/commissionStatements.ts";

describe("commissionStatements fee base", () => {
  it("sums subscription + volume for paid platform fee", () => {
    assert.equal(
      paidPlatformFeeFromBill({
        subscriptionAmount: "199.00",
        volumeFeeAmount: "12.50",
      }),
      211.5,
    );
    assert.equal(
      paidPlatformFeeFromBill({
        subscriptionAmount: null,
        volumeFeeAmount: "10",
      }),
      10,
    );
  });

  it("builds history from paid subscription + volume only", () => {
    const merchants = new Set(["m1"]);
    const rows = commissionHistoryFromBills(
      [
        {
          orgId: "m1",
          periodStart: "2026-08-01",
          subscriptionAmount: "199.00",
          volumeFeeAmount: "50.00",
          status: "paid",
        },
        {
          orgId: "m1",
          periodStart: "2026-08-01",
          subscriptionAmount: "199.00",
          volumeFeeAmount: "10.00",
          status: "issued",
        },
        {
          orgId: "other",
          periodStart: "2026-08-01",
          subscriptionAmount: "199.00",
          volumeFeeAmount: "999.00",
          status: "paid",
        },
      ],
      merchants,
      "15",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].periodKey, "2026-08");
    assert.equal(rows[0].platformFeeCollected, 249);
    // 249 * 15% = 37.35
    assert.equal(rows[0].commissionAmount, 37.35);
    assert.equal(rows[0].payoutStatus, "pending");
  });
});
