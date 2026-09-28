import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("merchant dashboard Transaction Volume", () => {
  it("renders the volume chart beside Networks & Assets under the KPI cards", () => {
    const page = read("src/merchant/DashboardPage.tsx");
    assert.match(page, /<TransactionVolumePanel query=\{chartQuery\} reloadToken=\{chartReloadToken\} \/>/);
    assert.match(page, /<NetworksAssetsPanel reloadToken=\{pairsReloadToken\} \/>/);
    assert.match(page, /dash-split pg-dash__split merchant-dash__chart-split/);
    assert.doesNotMatch(page, /<NetworkStatusStrip/);
    assert.ok(page.indexOf("pg-dash__kpi-row") < page.indexOf("<TransactionVolumePanel"));
    assert.ok(page.indexOf("<TransactionVolumePanel") < page.indexOf("<SitesTable"));
  });

  it("scopes the chart query to the merchant workspace and reloads on refresh", () => {
    const page = read("src/merchant/DashboardPage.tsx");
    assert.match(page, /\{ from: startDate, to: endDate, orgId: scopeOrgId, tz \}/);
    assert.match(page, /setChartReloadToken\(\(n\) => n \+ 1\)/);
    assert.match(page, /slices\.includes\("volume"\)\) setChartReloadToken/);
  });

  it("offers filter, USD + asset compare and zoom, but no maximize", () => {
    const panel = read("src/merchant/dashboard/TransactionVolumePanel.tsx");
    assert.match(panel, /<h2>Transaction Volume<\/h2>/);
    assert.match(panel, /<VolumeFilterSelect/);
    assert.match(panel, /volume-compare-toggle/);
    assert.match(panel, /zoomApiRef\.current\?\.zoomIn\(\)/);
    assert.match(panel, /zoomApiRef\.current\?\.zoomOut\(\)/);
    assert.doesNotMatch(panel, /ChartMaximize/);
    assert.match(panel, /metrics: FILTER_METRICS, asset, network/);
    assert.match(panel, /MERCHANT_VOLUME_CHART_HELP/);
  });

  it("uses the platform KPI row: no sparklines, Platform Fee card, then a Total volume feature card", () => {
    const page = read("src/merchant/DashboardPage.tsx");
    assert.match(page, /className="pg-dash__kpi-row merchant-dash__kpi-row"/);
    assert.doesNotMatch(page, /pg-dash__status-row/);
    assert.doesNotMatch(page, /linkWithTitle/);
    assert.match(page, /label="Total Transactions"[\s\S]*?trend=\{kpis\.settledTrend\}/);
    assert.doesNotMatch(page, /spark=/);
    assert.match(page, /tierLabel\(commercial\?\.tier\)\} tier/);
    assert.match(page, /<p className="pg-feature__kicker">Total volume<\/p>/);
    assert.match(page, /<AnimatedMetric value=\{kpis\.volume\} decimals=\{2\} prefix="\$" \/>/);
    const order = [
      'label="Total Transactions"',
      'label="Open Orders"',
      'label="Attention"',
      'label="Platform Fee"',
      '<div className="pg-feature" aria-label="Total volume">',
    ].map((m) => page.indexOf(m));
    assert.ok(order.every((i) => i > 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.doesNotMatch(page, /label="Total Volume"/);
  });

  it("links Networks & Assets to the merchant networks page", () => {
    const panel = read("src/merchant/dashboard/NetworksAssetsPanel.tsx");
    assert.match(panel, /merchantRoute\("networks"\)/);
    assert.match(panel, /<AssetNetworkTables compact sortable=\{false\}/);
  });
});

describe("merchant KPI accents", () => {
  it("Total Transactions is teal with the receipt icon; Platform Fee is gold", () => {
    const page = readFileSync(new URL("../src/merchant/DashboardPage.tsx", import.meta.url), "utf8");
    assert.match(page, /accent="teal"\s+icon=\{<TransactionsReceiptIcon \/>\}\s+label="Total Transactions"/);
    assert.match(page, /accent="gold"\s+label="Platform Fee"/);
  });
});

describe("merchant Total volume feature card", () => {
  it("has no vs-prior trend line", () => {
    const page = readFileSync(new URL("../src/merchant/DashboardPage.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(page, /vs prior period/);
  });
});

describe("merchant KPI number colour", () => {
  it("uses each card's accent colour", () => {
    const css = readFileSync(new URL("../src/styles/merchant/38-merchant-portal.css", import.meta.url), "utf8");
    assert.match(css, /\.merchant-dash__kpi-row \.pg-kpi__value \{\s*color: var\(--pg-accent\);/);
  });
});

describe("merchant Total volume figure", () => {
  it("renders at full feature size and colour on every dashboard", () => {
    const css = readFileSync(new URL("../src/styles/merchant/44-pg-dash.css", import.meta.url), "utf8");
    assert.match(css, /\.platform-shell \.pg-feature__value span \{\s*margin-top: 0;\s*font-size: inherit;\s*color: inherit;/);
    assert.doesNotMatch(css, /font-size: 0\.62em;\s*color: #fbbf24;/);
  });
});

describe("merchant KPI card tint", () => {
  it("uses the platform KPI card gradient (no merchant background override)", () => {
    const css = readFileSync(new URL("../src/styles/merchant/38-merchant-portal.css", import.meta.url), "utf8");
    assert.doesNotMatch(css, /\.merchant-dash__kpi-row \.pg-kpi \{/);
  });
});

describe("merchant dashboard lower split", () => {
  it("shows Sites beside Cashiers; no Recent payment orders or Open Attention", () => {
    const page = readFileSync(new URL("../src/merchant/DashboardPage.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(page, /RecentOrdersTable/);
    assert.match(page, /merchant-dash__lists[\s\S]*?<SitesTable rows=\{siteRows\} periodLabel=\{activePeriodLabel\} \/>\s*<CashiersTable/);
    assert.doesNotMatch(page, /AttentionQueue|listOrders/);
    assert.equal((page.match(/<CashiersTable/g) || []).length, 1);
    assert.match(page, /merchant-dash__split--single/);
    assert.equal((page.match(/<SitesTable/g) || []).length, 1);
  });
});

describe("Sites and Cashiers tables", () => {
  it("keep the Metrics-style title bar above a framed professional table", () => {
    for (const f of ["SitesTable.tsx", "CashiersTable.tsx"]) {
      const src = readFileSync(new URL(`../src/merchant/dashboard/${f}`, import.meta.url), "utf8");
      assert.match(src, /<table className="merchant-dash-table">/);
      assert.match(src, /className="overview-charts__title"/);
      assert.match(src, /merchant-dash-list__more/);
      assert.match(src, /<div className="merchant-dash-list__frame">\s*<div className="merchant-dash-list__scroll">/);
      assert.match(src, /<UsdAmount value=/);
    }
    const css = readFileSync(new URL("../src/styles/merchant/38-merchant-portal.css", import.meta.url), "utf8");
    assert.match(css, /\.merchant-dash-list__frame \{[^}]*border-radius: 12px;[^}]*background: #04182b/);
    assert.match(css, /\.merchant-dash-table th \{[^}]*background: #0a1e34/);
    assert.match(css, /\.merchant-dash-table__pin\.is-on \{[^}]*background:/);
  });

  it("paginate 10 rows per page with the shared pager inside the frame", () => {
    const hook = readFileSync(new URL("../src/merchant/dashboard/usePagedRows.ts", import.meta.url), "utf8");
    assert.match(hook, /DASH_TABLE_PAGE_SIZE = 10/);
    for (const f of ["SitesTable.tsx", "CashiersTable.tsx"]) {
      const src = readFileSync(new URL(`../src/merchant/dashboard/${f}`, import.meta.url), "utf8");
      assert.match(src, /const paged = usePagedRows\(rows\);\s*if \(rows\.length === 0\) return null;/);
      assert.match(src, /paged\.pageRows\.map\(/);
      assert.doesNotMatch(src, /\brows\.map\(/);
      assert.match(src, /<\/table>\s*<\/div>\s*<OrgListPagination[\s\S]*onPageChange=\{paged\.setPage\}/);
    }
    const css = readFileSync(new URL("../src/styles/merchant/38-merchant-portal.css", import.meta.url), "utf8");
    assert.match(css, /\.merchant-dash-list__frame \.org-pager \{[^}]*border-top:/);
  });

  it("Cashiers show a personal avatar, not the business mark", () => {
    const src = readFileSync(new URL("../src/merchant/dashboard/CashiersTable.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(src, /OrgBrandMark/);
    assert.match(src, /<DefaultUserAvatar \/>/);
    assert.match(src, /<PersonAvatar src=\{c\.avatarUrl\} \/>/);
    const rows = readFileSync(new URL("../src/merchant/dashboard/cashierRows.ts", import.meta.url), "utf8");
    assert.match(rows, /avatarUrl: person\?\.avatarUrl \?\? null/);
  });
});

describe("merchant KPI icons", () => {
  it("Open Orders uses a clock; Attention all-clear uses a check (outline set)", () => {
    const page = readFileSync(new URL("../src/merchant/DashboardPage.tsx", import.meta.url), "utf8");
    assert.match(page, /icon=\{<OpenOrdersIcon \/>\}\s+label="Open Orders"/);
    assert.match(page, /icon=\{kpis\.anomalies > 0 \? undefined : <AllClearIcon \/>\}/);
    assert.match(page, /function OpenOrdersIcon\(\)[\s\S]*?<path d="M12 7v5l3 2" \/>/);
  });
});

describe("merchant dashboard sections", () => {
  it("has no Orders by channel breakdown", () => {
    const page = readFileSync(new URL("../src/merchant/DashboardPage.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(page, /ChannelBreakdown/);
  });
});
