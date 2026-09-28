import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nextUpcomingWindow, upcomingPayable } from "../src/service-bills/upcoming-bills.mjs";

describe("upcoming service bills", () => {
  it("uses the head period until its bill exists, then the next month", () => {
    assert.deepEqual(
      nextUpcomingWindow({ periodStart: "2026-09-05", invoiceOn: "2026-10-05", headBillExists: false }),
      { periodStart: "2026-09-05", invoiceOn: "2026-10-05" },
    );
    assert.deepEqual(
      nextUpcomingWindow({ periodStart: "2026-09-05", invoiceOn: "2026-10-05", headBillExists: true }),
      { periodStart: "2026-10-05", invoiceOn: "2026-11-05" },
    );
  });

  it("applies credit up to the total, and waivers zero the payable", () => {
    assert.deepEqual(upcomingPayable({ totalAmount: "120.50", creditUsd: "20", waived: false }), {
      payable: "100.50",
      creditApplied: "20.00",
    });
    assert.deepEqual(upcomingPayable({ totalAmount: "15.00", creditUsd: "40", waived: false }), {
      payable: "0.00",
      creditApplied: "15.00",
    });
    assert.deepEqual(upcomingPayable({ totalAmount: "99.00", creditUsd: "10", waived: true }), {
      payable: "0.00",
      creditApplied: "0.00",
    });
  });
});
