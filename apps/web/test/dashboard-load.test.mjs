import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dash = readFileSync(join(root, "src/merchant/DashboardPage.tsx"), "utf8");
const alerts = readFileSync(join(root, "src/merchant/merchantAlerts.ts"), "utf8");
const lamps = readFileSync(join(root, "src/shared/networkLamp.ts"), "utf8");
const platformDash = readFileSync(
  join(root, "src/platform/DashboardPage.tsx"),
  "utf8",
);
const agentDash = readFileSync(join(root, "src/agent/DashboardPage.tsx"), "utf8");

describe("merchant dashboard first paint", () => {
  it("loads server KPIs independently from recent orders and network status", () => {
    assert.match(dash, /getDashboardKpis\(\{ from: startDate, to: endDate/);
    assert.match(dash, /listOrders\(\{ limit: 8 \}\)/);
    assert.match(dash, /getNetworksStatus/);
    assert.doesNotMatch(dash, /listAllOrders|getMerchantOrders\(\)/);
  });

  it("does not paint unknown ingest as Down while status is loading", () => {
    assert.match(lamps, /pendingOrderabilityLamp/);
    assert.match(lamps, /code: "checking"/);
    assert.match(dash, /pendingOrderabilityLamp\(pair\.enabled\)/);
  });

  it("overlaps alert order fetch with the rest of the alert fan-out", () => {
    const start = alerts.indexOf("const ordersPromise = getOrderSummary(");
    const rest = alerts.indexOf("await Promise.all([", start);
    const consume = alerts.indexOf("const summary = await ordersPromise", start);
    assert.ok(start >= 0 && rest > start && consume > rest);
  });

  it("keeps platform/agent date filters mounted while the range refetches", () => {
    assert.match(platformDash, /loading && !hasLoaded/);
    assert.match(platformDash, /pg-dash__period/);
    assert.match(platformDash, /is-period-refresh/);
    assert.doesNotMatch(
      platformDash,
      /if \(loading\) \{\s*return \(\s*<PlatformPending/,
    );
    assert.match(agentDash, /PlatformDashboardPage/);
    assert.match(agentDash, /DashboardPortalContext\.Provider/);
  });

  it("portals platform/agent dashboard card help so overflow cards cannot crop it", () => {
    const help = readFileSync(
      join(root, "src/platform/ui/ChartHelpButton.tsx"),
      "utf8",
    );
    assert.match(help, /createPortal/);
    assert.match(platformDash, /function CardHelp[\s\S]*ChartHelpButton/);
    assert.match(agentDash, /PlatformDashboardPage/);
    const css = readFileSync(join(root, "src/styles/merchant.css"), "utf8");
    assert.match(css, /\.chart-help__popover--portal[\s\S]*background:\s*#1e2a38/);
  });

  it("labels platform money as USD figures with two decimals", () => {
    const fund = readFileSync(
      join(root, "src/shared/AnimatedFundAmount.tsx"),
      "utf8",
    );
    const tween = readFileSync(
      join(root, "src/shared/useAnimatedNumber.ts"),
      "utf8",
    );
    assert.match(fund, /minimumFractionDigits: 2/);
    assert.match(fund, /useAnimatedNumber/);
    assert.match(tween, /easeOutCubic/);
    assert.match(platformDash, /formatMoneyFigureFixed/);
  });

  it("formats dashboard money as USD, not $", () => {
    assert.match(platformDash, /formatMoneyFigure\(n\)\} USD/);
    assert.doesNotMatch(platformDash, /`\$\$\{formatMoneyFigure/);
    const axis = readFileSync(join(root, "src/platform/ui/chartAxis.ts"), "utf8");
    assert.match(axis, /suffix = money \? " USD"/);
    assert.doesNotMatch(axis, /prefix = money \? "\$"/);
  });

  it("labels platform volume chart and status KPIs from server series", () => {
    assert.match(platformDash, /Transaction Volume/);
    assert.match(platformDash, /getDashboardSeries/);
    assert.match(platformDash, /Overdue Invoices/);
    assert.match(platformDash, /Pending Payouts/);
    assert.match(platformDash, /Commission owed/);
    assert.match(platformDash, /Flagged for Review/);
  });

  it("paints cached KPIs first, then refreshes KPIs and series from the server", () => {
    const load = platformDash.indexOf("const load = useCallback");
    assert.ok(load >= 0);
    const body = platformDash.slice(load, load + 3000);
    assert.match(body, /peekDashboardKpis\(query\)/);
    assert.match(body, /getDashboardKpis\(q\)/);
    assert.match(body, /getDashboardSeries\(q, \{ metrics: TOTAL_METRICS \}\)/);
    assert.doesNotMatch(body, /getPlatformOrders|listAllOrders|listAuditLog/);
  });
});
