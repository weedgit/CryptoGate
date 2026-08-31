import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "src/styles/merchant.css"), "utf8");
const platformShell = readFileSync(
  join(root, "src/platform/PlatformShell.tsx"),
  "utf8",
);
const agentShell = readFileSync(join(root, "src/agent/AgentShell.tsx"), "utf8");
const merchantDash = readFileSync(
  join(root, "src/merchant/DashboardPage.tsx"),
  "utf8",
);

describe("responsive UI smoke selectors", () => {
  it("shells force expanded nav chrome on tablet", () => {
    assert.match(platformShell, /isTabletOrBelow/);
    assert.match(platformShell, /navCollapsed/);
    assert.match(agentShell, /isTabletOrBelow/);
    assert.match(agentShell, /navCollapsed/);
  });

  it("defines tablet / phone / small-phone breakpoints", () => {
    assert.match(css, /@media \(max-width: 1100px\)/);
    assert.match(css, /@media \(max-width: 640px\)/);
    assert.match(css, /@media \(max-width: 390px\)/);
  });

  it("period controls wrap on phone", () => {
    assert.match(
      css,
      /\.plat-period-pills--topbar[\s\S]*?flex-wrap:\s*wrap/,
    );
  });

  it("onboard wizard foot is sticky/wrap on phone", () => {
    assert.match(css, /\.b4-wizard__foot[\s\S]*?position:\s*sticky/);
    assert.match(css, /\.b4-wizard__foot[\s\S]*?flex-wrap:\s*wrap/);
  });

  it("merchant dash orders scroll on narrow screens", () => {
    assert.match(merchantDash, /merchant-dash-orders__scroll/);
    assert.match(css, /\.merchant-dash-orders__scroll[\s\S]*?overflow-x:\s*auto/);
  });

  it("compliance KPIs go single-column on small phones", () => {
    assert.match(
      css,
      /@media \(max-width: 390px\)[\s\S]*?\.plat-compliance__kpis[\s\S]*?grid-template-columns:\s*1fr/,
    );
  });
});
