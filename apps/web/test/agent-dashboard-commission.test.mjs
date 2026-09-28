import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  billingScheduleCell,
  commissionBillCell,
  formatUsd2,
  formatUtcDay,
  merchantStatusLabel,
} from "../src/platform/ui/commissionPreviewModel.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const merchant = (over = {}) => ({
  orgId: "m1",
  name: "Alpha",
  status: "active",
  siteCount: 0,
  transactions: 3,
  volumeUsd: 120,
  subscriptionUsd: 0,
  volumeFeeUsd: 0,
  baseUsd: 0,
  commissionUsd: 0,
  paidBillId: null,
  openBill: null,
  ...over,
});

describe("agent dashboard commission model", () => {
  it("formats money and UTC days", () => {
    assert.equal(formatUsd2(1234.5), "$1,234.50");
    assert.equal(formatUsd2(0), "$0.00");
    assert.equal(formatUtcDay("2026-10-05"), "Oct 5");
    assert.equal(formatUtcDay(null), "—");
  });

  it("tells the agent what each bill state means for commission", () => {
    const overdue = commissionBillCell(
      merchant({ openBill: { id: "b9", status: "overdue", dueAt: "2026-09-10T00:00:00Z", count: 2, amountUsd: 50 } }),
    );
    assert.equal(overdue.tone, "danger");
    assert.equal(overdue.label, "Overdue $50.00 (2 bills)");
    assert.equal(overdue.billId, "b9");
    assert.match(overdue.note, /won't count until paid/);

    const issued = commissionBillCell(
      merchant({ openBill: { id: "b8", status: "issued", dueAt: "2026-10-10T00:00:00Z", count: 1, amountUsd: 30 } }),
    );
    assert.equal(issued.tone, "warn");
    assert.match(issued.note, /Due Oct 10/);

    const paid = commissionBillCell(merchant({ baseUsd: 75.5, paidBillId: "b1" }));
    assert.deepEqual([paid.label, paid.tone, paid.billId], ["Paid", "ok", "b1"]);

    assert.equal(commissionBillCell(merchant({ status: "paused" })).label, "Paused");
    assert.equal(commissionBillCell(merchant()).label, "No bill paid yet");
    assert.equal(merchantStatusLabel("idle"), "No orders");
  });

  it("shows each merchant's billing schedule", () => {
    const pending = billingScheduleCell(merchant());
    assert.deepEqual([pending.label, pending.pending], ["Not activated", true]);

    const active = billingScheduleCell(
      merchant({ billingAnchorAt: "2025-12-01", nextInvoiceOn: "2026-10-01" }),
    );
    assert.equal(active.label, "Next bill Oct 1");
    assert.equal(active.note, "Monthly on the 1st · since Dec 1, 2025");

    const noNext = billingScheduleCell(merchant({ billingAnchorAt: "2026-03-22" }));
    assert.equal(noNext.label, "Monthly on the 22nd");
  });

  it("panel shows merchant icons, schedule column, and the formula tooltip", () => {
    const panel = read("src/platform/ui/CommissionByMerchantPanel.tsx");
    assert.match(panel, /<OrgBrandMark[\s\S]*?iconKey=\{m\.iconKey\}/);
    assert.match(panel, /<th>Billing schedule<\/th>/);
    assert.match(panel, /className="plat-card-help__tip" role="tooltip"/);
    assert.doesNotMatch(panel, /pg-commission-panel__how/);
  });

  it("agent dashboard: MTD default, card order, estimate card, and table placement", () => {
    const page = read("src/platform/DashboardPage.tsx");
    assert.match(page, /\{ id: "mtd", label: "MTD" \}/);
    assert.match(page, /const defaultPeriod: PeriodId = isAgent \? "mtd" : "7d"/);
    assert.match(page, /return \{ from: `\$\{today\.slice\(0, 8\)\}01`, to: today \}/);
    assert.match(page, /const today = zonedYmd\(\);/);
    assert.match(page, /tz: viewerTz/);
    assert.doesNotMatch(page, /queryTz|"UTC" : undefined/);
    const kpi = page.split('className="pg-dash__kpi-row"')[1].split('className="pg-feature"')[0];
    const order = ["Total Merchants", "Total Transactions", "Total Volume", "Merchant Fees"].map((l) =>
      kpi.indexOf(`label="${l}"`),
    );
    assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), `order ${order}`);
    assert.match(kpi, /icon=\{<MerchantFeesIcon \/>\}/);
    assert.match(page, /Estimated · \{commissionPreview\.commissionPercent\}%/);
    const panelAt = page.indexOf("<CommissionByMerchantPanel");
    assert.ok(panelAt > page.indexOf("dash-split pg-dash__split"));
    assert.ok(panelAt < page.indexOf('title="Metrics"'));
    assert.match(read("src/shared/dashboardApi.ts"), /tz: q\.tz \|\| viewerTimeZone\(\)/);
  });
});
