import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addOneMonthUtc,
  addOneMonthUtcDateString,
  dueAtFromSendPlusDays,
  msUntilNextUtcMidnight,
  utcToday,
} from "../src/service-bills/billing-anchor-rules.mjs";

describe("billing-anchor-rules", () => {
  it("adds one month with day clamp (31 Jan → 28 Feb 2026)", () => {
    const next = addOneMonthUtc("2026-01-31T15:30:00.000Z");
    assert.equal(next.toISOString(), "2026-02-28T15:30:00.000Z");
    assert.equal(addOneMonthUtcDateString("2026-03-31T12:00:00.000Z"), "2026-04-30");
  });

  it("adds one month from mid-month without clamp", () => {
    assert.equal(addOneMonthUtcDateString("2026-03-01T00:00:00.000Z"), "2026-04-01");
    assert.equal(addOneMonthUtcDateString("2026-03-15T08:00:00.000Z"), "2026-04-15");
  });

  it("utcToday is YYYY-MM-DD", () => {
    assert.equal(utcToday(new Date("2026-09-24T23:59:59.000Z")), "2026-09-24");
  });

  it("dueAtFromSendPlusDays ends at 23:59:59.999Z", () => {
    const due = dueAtFromSendPlusDays("2026-03-12", 7);
    assert.match(due, /^2026-03-19T23:59:59\.999Z$/);
  });

  it("msUntilNextUtcMidnight is positive before midnight", () => {
    const now = new Date("2026-03-12T12:00:00.000Z");
    const ms = msUntilNextUtcMidnight(now);
    assert.equal(ms, 12 * 60 * 60 * 1000);
  });
});
