import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { platformFeeStatus } from "../src/merchant/dashboard/platformFeeStatus.ts";

const base = { billingAnchorAt: "2025-12-01T00:00:00.000Z", nextInvoiceOn: "2026-10-01", openBills: 0, overdueBills: 0 };

describe("platformFeeStatus", () => {
  it("not activated without a billing anchor", () => {
    const s = platformFeeStatus({ ...base, billingAnchorAt: null });
    assert.deepEqual(s, { label: "Not activated", tone: "muted", schedule: "Billing starts after activation" });
  });
  it("overdue beats unpaid", () => {
    const s = platformFeeStatus({ ...base, openBills: 2, overdueBills: 1 });
    assert.equal(s.label, "Overdue · 1 bill");
    assert.equal(s.tone, "danger");
    assert.equal(s.schedule, "Next bill Oct 1");
  });
  it("unpaid open bills", () => {
    const s = platformFeeStatus({ ...base, openBills: 2 });
    assert.equal(s.label, "Unpaid · 2 bills");
    assert.equal(s.tone, "warn");
  });
  it("waived months left", () => {
    const s = platformFeeStatus({ ...base, waivedMonthsLeft: 2 });
    assert.equal(s.label, "Waived");
    assert.equal(s.schedule, "Next bill Oct 1 · 2 months waived left");
  });
  it("paid up, and monthly fallback without a next date", () => {
    assert.deepEqual(platformFeeStatus(base), { label: "Paid up", tone: "ok", schedule: "Next bill Oct 1" });
    assert.equal(platformFeeStatus({ ...base, nextInvoiceOn: null }).schedule, "Billed monthly");
  });
  it("renders in the Platform Fee card footer", () => {
    const page = readFileSync(new URL("../src/merchant/DashboardPage.tsx", import.meta.url), "utf8");
    assert.match(page, /label="Platform Fee"[\s\S]*?footer=\{[\s\S]*?merchant-dash__fee-badge is-\$\{feeStatus\.tone\}/);
    const card = readFileSync(new URL("../src/platform/ui/DashKpiCard.tsx", import.meta.url), "utf8");
    assert.match(card, /<div className="pg-kpi__bottom">\s*\{!linkWithTitle \? link : null\}\s*<div className="pg-kpi__footer">/);
  });
});

describe("platform fee footer style", () => {
  it("is a divided footer row with a dot status (no pill border)", () => {
    const css = readFileSync(new URL("../src/styles/merchant/38-merchant-portal.css", import.meta.url), "utf8");
    assert.match(css, /\.pg-kpi__bottom \{[^}]*border-top: 1px solid/);
    const badge = css.match(/\.platform-shell \.merchant-dash__fee-badge \{[^}]*\}/)[0];
    assert.doesNotMatch(badge, /border:|border-radius: 999px/);
    assert.match(css, /\.merchant-dash__fee-schedule \{[^}]*border-left: 1px solid/);
  });
});
