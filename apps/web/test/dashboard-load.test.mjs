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
  it("loads orders independently from dashboard extras", () => {
    assert.match(dash, /void getMerchantOrders\(\)/);
    assert.match(dash, /getMerchantServiceBills/);
    assert.match(dash, /getNetworksStatus/);
    assert.doesNotMatch(dash, /await Promise\.all\(\[\s*ordersPromise/);
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
    assert.match(platformDash, /periodPortal/);
    assert.doesNotMatch(
      platformDash,
      /if \(loading\) \{\s*return \(\s*<PlatformPending/,
    );
    assert.match(agentDash, /loading && !hasLoaded/);
    assert.match(agentDash, /periodPortal/);
  });

  it("portals platform/agent dashboard card help so overflow cards cannot crop it", () => {
    const help = readFileSync(
      join(root, "src/platform/ui/ChartHelpButton.tsx"),
      "utf8",
    );
    assert.match(help, /createPortal/);
    assert.match(platformDash, /function CardHelp[\s\S]*ChartHelpButton/);
    assert.match(agentDash, /function CardHelp[\s\S]*ChartHelpButton/);
    const agentDetail = readFileSync(
      join(root, "src/platform/AgentDetailCard.tsx"),
      "utf8",
    );
    assert.match(agentDetail, /function KpiHelp[\s\S]*ChartHelpButton/);
    const css = readFileSync(join(root, "src/styles/merchant.css"), "utf8");
    assert.match(css, /\.chart-help__popover--portal[\s\S]*background:\s*#1e2a38/);
  });

  it("labels platform/agent funds in USD with two decimal places", () => {
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
    assert.match(platformDash, /AnimatedFundAmount/);
    assert.match(agentDash, /AnimatedFundAmount/);
    assert.doesNotMatch(platformDash, /plat-fund-rail__currency/);
    assert.match(platformDash, /plat-fund-rail__total[\s\S]*showUnit=\{false\}/);
    assert.match(agentDash, /plat-fund-rail__total[\s\S]*showUnit=\{false\}/);
  });

  it("formats dashboard money as USD, not $", () => {
    assert.match(platformDash, /formatMoneyFigure\(n\)\} USD/);
    assert.doesNotMatch(platformDash, /`\$\$\{formatMoneyFigure/);
    const axis = readFileSync(join(root, "src/platform/ui/chartAxis.ts"), "utf8");
    assert.match(axis, /suffix = money \? " USD"/);
    assert.doesNotMatch(axis, /prefix = money \? "\$"/);
  });

  it("paints platform overview before signup summary finishes", () => {
    const load = platformDash.indexOf("const load = useCallback");
    const core = platformDash.indexOf("await Promise.all([", load);
    const summary = platformDash.indexOf("getPlatformDashboardSummary(", load);
    assert.ok(load >= 0 && core >= 0 && summary >= 0);
    assert.ok(summary < core);
    assert.match(platformDash, /peekPlatformOrgs/);
    assert.match(platformDash, /peekPlatformOrders/);
    assert.match(platformDash, /getPlatformOrders/);
    const allSlice = platformDash.slice(core, core + 280);
    assert.doesNotMatch(allSlice, /listAuditLog/);
  });
});
