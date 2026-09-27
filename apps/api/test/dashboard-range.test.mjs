import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  bucketKeySql,
  bucketKeys,
  daySpan,
  fillSeries,
  isValidTimeZone,
  monthKeysForRange,
  parseDashboardRange,
  percentChange,
  pickInterval,
} from "../src/dashboard/dashboard-range.mjs";

const params = (q) => new URLSearchParams(q);

describe("dashboard range parsing", () => {
  it("accepts calendar dates + IANA tz and derives the previous period", () => {
    const r = parseDashboardRange(params("from=2026-09-20&to=2026-09-26&tz=America/Los_Angeles"));
    assert.equal(r.ok, true);
    assert.deepEqual(r.range, {
      from: "2026-09-20",
      to: "2026-09-26",
      tz: "America/Los_Angeles",
      days: 7,
      interval: "day",
      prevFrom: "2026-09-13",
      prevTo: "2026-09-19",
    });
  });

  it("defaults tz to UTC", () => {
    const r = parseDashboardRange(params("from=2026-09-26&to=2026-09-26"));
    assert.equal(r.ok, true);
    assert.equal(r.range.tz, "UTC");
    assert.equal(r.range.interval, "hour");
    assert.equal(r.range.prevFrom, "2026-09-25");
  });

  it("rejects bad dates, reversed ranges, long ranges and bad tz", () => {
    assert.equal(parseDashboardRange(params("from=2026-02-30&to=2026-03-01")).ok, false);
    assert.equal(parseDashboardRange(params("from=2026-09-26T00:00:00Z&to=2026-09-27")).ok, false);
    assert.equal(parseDashboardRange(params("from=2026-09-27&to=2026-09-26")).ok, false);
    const long = parseDashboardRange(params("from=2025-01-01&to=2026-09-26"));
    assert.equal(long.ok, false);
    assert.equal(long.code, "range_too_long");
    assert.equal(parseDashboardRange(params("from=2026-09-01&to=2026-09-02&tz=Mars/Base")).ok, false);
    assert.equal(parseDashboardRange(params("from=2026-09-01&to=2026-09-02&tz=UTC';drop")).ok, false);
  });

  it("allows exactly one year", () => {
    const r = parseDashboardRange(params("from=2025-09-27&to=2026-09-27"));
    assert.equal(r.ok, true);
    assert.equal(r.range.days, 366);
    assert.equal(r.range.interval, "week");
  });
});

describe("dashboard interval", () => {
  it("hour for one day, day up to 62 days, week beyond", () => {
    assert.equal(pickInterval(1), "hour");
    assert.equal(pickInterval(2), "day");
    assert.equal(pickInterval(31), "day");
    assert.equal(pickInterval(62), "day");
    assert.equal(pickInterval(63), "week");
    assert.equal(pickInterval(92), "week");
    assert.equal(pickInterval(366), "week");
  });

  it("keeps chart points readable for every preset", () => {
    const now = new Date("2026-09-27T01:00:00Z");
    const points = (from, to) => {
      const r = parseDashboardRange(params(`from=${from}&to=${to}&tz=UTC`)).range;
      return bucketKeys(r, now).length;
    };
    assert.equal(points("2026-09-21", "2026-09-27"), 7);
    assert.equal(points("2026-08-27", "2026-09-27"), 32);
    assert.equal(points("2026-06-27", "2026-09-27"), 14);
    assert.equal(points("2025-09-27", "2026-09-27"), 53);
  });
});

describe("dashboard bucket keys", () => {
  it("hourly keys stop at the current local hour for today", () => {
    const r = parseDashboardRange(params("from=2026-09-26&to=2026-09-26&tz=America/Los_Angeles")).range;
    // 2026-09-27T01:30Z is 18:30 on Sep 26 in Los Angeles (UTC-7).
    const keys = bucketKeys(r, new Date("2026-09-27T01:30:00Z"));
    assert.equal(keys.length, 19);
    assert.equal(keys[0], "2026-09-26T00");
    assert.equal(keys.at(-1), "2026-09-26T18");
  });

  it("full 24 hours for a past day", () => {
    const r = parseDashboardRange(params("from=2026-09-01&to=2026-09-01&tz=UTC")).range;
    assert.equal(bucketKeys(r, new Date("2026-09-27T00:00:00Z")).length, 24);
  });

  it("weekly keys start at the range start and step 7 days", () => {
    const r = parseDashboardRange(params("from=2026-06-27&to=2026-09-27&tz=UTC")).range;
    const keys = bucketKeys(r);
    assert.equal(keys[0], "2026-06-27");
    assert.equal(keys[1], "2026-07-04");
    assert.ok(keys.at(-1) <= "2026-09-27");
  });

  it("SQL bucket expressions match key formats", () => {
    assert.match(bucketKeySql("hour", "o.created_at", 3, 4), /YYYY-MM-DD"T"HH24/);
    assert.match(bucketKeySql("day", "o.created_at", 3, 4), /AT TIME ZONE \$3\)::date, 'YYYY-MM-DD'/);
    assert.match(bucketKeySql("week", "o.created_at", 3, 4), /\$4::date \+ \(\(\(.*\/ 7\) \* 7\)/);
  });
});

describe("dashboard helpers", () => {
  it("date math", () => {
    assert.equal(addDays("2026-02-28", 1), "2026-03-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(daySpan("2026-09-01", "2026-09-30"), 30);
  });

  it("month keys for commission periods", () => {
    assert.deepEqual(monthKeysForRange("2026-06-27", "2026-09-27"), [
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    assert.deepEqual(monthKeysForRange("2025-12-15", "2026-01-02"), ["2025-12", "2026-01"]);
  });

  it("fills missing buckets with zero", () => {
    const keys = ["a", "b", "c"];
    assert.deepEqual(fillSeries(keys, new Map([["b", 2.5]])), [0, 2.5, 0]);
  });

  it("percent change vs previous period", () => {
    assert.equal(percentChange(150, 100), 50);
    assert.equal(percentChange(50, 100), -50);
    assert.equal(percentChange(10, 0), 100);
    assert.equal(percentChange(0, 0), null);
  });

  it("validates time zones", () => {
    assert.equal(isValidTimeZone("UTC"), true);
    assert.equal(isValidTimeZone("Asia/Seoul"), true);
    assert.equal(isValidTimeZone("Not/AZone"), false);
    assert.equal(isValidTimeZone("UTC; DROP"), false);
  });
});
