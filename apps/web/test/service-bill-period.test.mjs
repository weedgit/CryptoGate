import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatServiceBillPeriodRange,
  serviceBillManageHint,
  serviceBillPeriodOptions,
} from "../src/shared/serviceBillPeriod.ts";

describe("serviceBillPeriod labels", () => {
  it("formats fee window like the Period column", () => {
    assert.equal(
      formatServiceBillPeriodRange("2026-07-31", "2026-08-30"),
      "Jul 31, 2026 → Aug 30, 2026",
    );
  });

  it("builds dropdown options from periodStart without raw ISO-only labels", () => {
    const opts = serviceBillPeriodOptions([
      { periodStart: "2026-07-31", periodEnd: "2026-08-30" },
      { periodStart: "2026-07-31", periodEnd: "2026-08-30" },
      { periodStart: "2026-08-31", periodEnd: "2026-09-29" },
    ]);
    assert.equal(opts.length, 2);
    assert.equal(opts[0].start, "2026-08-31");
    assert.match(opts[0].label, /Aug 31, 2026 → Sep 29, 2026/);
    assert.doesNotMatch(opts[0].label, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("hints manage CTAs for drafts and unpaid", () => {
    assert.equal(serviceBillManageHint("draft"), "Open to send");
    assert.equal(serviceBillManageHint("issued"), "Open to mark paid");
    assert.equal(serviceBillManageHint("overdue"), "Open to collect");
    assert.equal(serviceBillManageHint("paid"), null);
  });
});
