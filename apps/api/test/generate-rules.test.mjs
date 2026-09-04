import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultDueAt,
  merchantOnboardedInPeriod,
  previousCalendarMonthUtc,
  resolveGeneratePeriod,
  roundUsd,
  volumeFeeUsd,
} from "../src/service-bills/generate-rules.mjs";

describe("service bill generate rules", () => {
  it("previousCalendarMonthUtc is the UTC month before now", () => {
    const p = previousCalendarMonthUtc(new Date("2026-08-27T10:00:00.000Z"));
    assert.equal(p.periodStart, "2026-07-01");
    assert.equal(p.periodEnd, "2026-07-31");
    assert.equal(p.inclusiveStartIso, "2026-07-01T00:00:00.000Z");
    assert.equal(p.exclusiveEndIso, "2026-08-01T00:00:00.000Z");
  });

  it("rounds USD half-up without float", () => {
    assert.equal(roundUsd("12.5"), "12.50");
    assert.equal(roundUsd("12.504"), "12.50");
    assert.equal(roundUsd("12.505"), "12.51");
    assert.equal(roundUsd("0"), "0.00");
  });

  it("computes volume fee as percent of rounded volume", () => {
    assert.equal(volumeFeeUsd("1000.00", "1.20"), "12.00");
    assert.equal(volumeFeeUsd("245.00", "2.00"), "4.90");
    assert.equal(volumeFeeUsd("0", "1.20"), "0.00");
  });

  it("defaults generate period to previous month when body empty", () => {
    const r = resolveGeneratePeriod({}, new Date("2026-03-05T00:00:00.000Z"));
    assert.equal(r.ok, true);
    assert.equal(r.periodStart, "2026-02-01");
    assert.equal(r.periodEnd, "2026-02-28");
  });

  it("rejects inverted custom periods", () => {
    const r = resolveGeneratePeriod({
      periodStart: "2026-08-01",
      periodEnd: "2026-07-01",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "invalid_request");
  });

  it("due date is 14 days after period end", () => {
    assert.equal(defaultDueAt("2026-07-31").startsWith("2026-08-14"), true);
  });

  it("merchantOnboardedInPeriod rejects merchants created after period end", () => {
    assert.equal(
      merchantOnboardedInPeriod("2026-09-02T08:00:00.000Z", "2026-08-31"),
      false,
    );
    assert.equal(
      merchantOnboardedInPeriod("2026-08-31T23:59:00.000Z", "2026-08-31"),
      true,
    );
    assert.equal(
      merchantOnboardedInPeriod("2026-08-15T00:00:00.000Z", "2026-08-31"),
      true,
    );
  });
});
