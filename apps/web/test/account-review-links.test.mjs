import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  billsReviewQuery,
  utcMonthBounds,
  volumeReviewQuery,
} from "../src/platform/accountReviewLinks.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NOW = new Date("2026-02-14T23:30:00Z");
const AGENT = "11111111-1111-4111-8111-111111111111";

function query(qs) {
  return Object.fromEntries(new URLSearchParams(qs));
}

describe("account KPI review links", () => {
  it("uses UTC month bounds (matching the MTD KPIs)", () => {
    assert.deepEqual(utcMonthBounds(NOW), {
      monthStart: "2026-02-01",
      monthEnd: "2026-02-28",
      today: "2026-02-14",
    });
    assert.equal(utcMonthBounds(new Date("2028-02-29T01:00:00+05:00")).monthEnd, "2028-02-29");
  });

  it("volume link opens completed invoices this UTC month", () => {
    const href = volumeReviewQuery({ agentId: AGENT }, NOW);
    assert.deepEqual(query(href), {
      status: "completed",
      period: "custom",
      from: "2026-02-01",
      to: "2026-02-14",
      utc: "1",
      agent: AGENT,
    });
    assert.equal(query(volumeReviewQuery({ merchantId: "m-1" }, NOW)).merchant, "m-1");
  });

  it("bills link filters by billing period overlapping this month", () => {
    const href = billsReviewQuery({ merchantId: "m-1" }, NOW);
    assert.deepEqual(query(href), {
      merchant: "m-1",
      periodFrom: "2026-02-01",
      periodTo: "2026-02-28",
    });
    assert.equal(query(billsReviewQuery({ agentId: AGENT }, NOW)).agent, AGENT);
  });

  it("agent and merchant cards show Review links only on the platform", () => {
    for (const file of ["AgentDetailCard.tsx", "MerchantDetailCard.tsx"]) {
      const src = readFileSync(join(root, "src/platform", file), "utf8");
      assert.match(src, /platformRoute\("invoices"\)\}\?\$\{volumeReviewQuery\(/, file);
      assert.match(src, /platformRoute\("service-bills"\)\}\?\$\{billsReviewQuery\(/, file);
      assert.match(src, /portal \? null : \(/, file);
    }
  });

  it("list pages read the review filters from the URL", () => {
    const bills = readFileSync(join(root, "src/platform/ServiceBillsListPage.tsx"), "utf8");
    assert.match(bills, /searchParams\.get\("periodFrom"\)/);
    assert.match(bills, /searchParams\.get\("agent"\)/);
    const invoices = readFileSync(join(root, "src/shared/InvoiceListPage.tsx"), "utf8");
    assert.match(invoices, /searchParams\.get\("utc"\) === "1"/);
    assert.match(invoices, /searchParams\.get\("agent"\)/);
  });
});
