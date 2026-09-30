import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  experienceShowsServiceBills,
  resolveMerchantExperience,
} from "../src/merchant/experience.ts";
import { sitesInMerchantSubtree } from "../src/merchant/org.ts";
import { mergeCashierRows } from "../src/merchant/dashboard/cashierRows.ts";
import {
  defaultWorkspaceOrgId,
  resolveWorkspaceOrgId,
  scopeSessionToWorkspace,
  sessionWorkspaces,
  unscopeSession,
} from "../src/merchant/workspace.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const session = (...memberships) => ({ memberships });
const m = (orgType, role, orgId = `${orgType}-${role}`) => ({ orgType, role, orgId });

describe("merchant portal experiences", () => {
  it("resolves merchant, site, and cashier experiences from memberships", () => {
    assert.equal(resolveMerchantExperience(session(m("merchant", "owner"))), "merchant");
    assert.equal(resolveMerchantExperience(session(m("merchant", "viewer"))), "merchant");
    assert.equal(
      resolveMerchantExperience(session(m("merchant_site", "administrator"))),
      "site",
    );
    assert.equal(resolveMerchantExperience(session(m("merchant_site", "cashier"))), "cashier");
    assert.equal(resolveMerchantExperience(session(m("merchant", "cashier"))), "cashier");
    assert.equal(
      resolveMerchantExperience(
        session(m("merchant_site", "owner"), m("merchant", "administrator")),
      ),
      "merchant",
    );
  });

  it("shows service bills to merchants only", () => {
    assert.equal(experienceShowsServiceBills("merchant"), true);
    assert.equal(experienceShowsServiceBills("site"), false);
    assert.equal(experienceShowsServiceBills("cashier"), false);
  });

  it("finds nested sites under a merchant, not sibling merchants", () => {
    const orgs = [
      { id: "m1", type: "merchant", parentId: "agent" },
      { id: "s1", type: "merchant_site", parentId: "m1", name: "Downtown" },
      { id: "s2", type: "merchant_site", parentId: "s1", name: "Kiosk" },
      { id: "m2", type: "merchant", parentId: "m1" },
      { id: "s3", type: "merchant_site", parentId: "m2" },
    ];
    const sites = sitesInMerchantSubtree(orgs, "m1");
    assert.deepEqual(
      sites.map((s) => s.id),
      ["s1", "s2"],
    );
    assert.equal(sites[0].name, "Downtown");
  });

  it("splits cashier and back-office route tables", () => {
    const app = read("src/merchant/MerchantApp.tsx");
    assert.match(app, /resolveMerchantExperience/);
    assert.match(app, /function cashierRoutes/);
    assert.match(app, /function backOfficeRoutes/);
    const cashier = app.split("function cashierRoutes")[1]?.split("function backOfficeRoutes")[0] ?? "";
    assert.match(cashier, /path="orders\/\*"/);
    assert.match(cashier, /CashierForbiddenPage/);
    assert.doesNotMatch(cashier, /path="(service-bills|sites|settings\/settlement|networks)/);
    const backOffice = app.split("function backOfficeRoutes")[1] ?? "";
    assert.match(backOffice, /showBills \?/);
  });

  it("cashier pad accepts at most two decimals and one dot", async () => {
    const { applyPadKey } = await import("../src/merchant/cashier/cashierLogic.ts");
    const type = (keys) => keys.reduce((acc, k) => applyPadKey(acc, k), "");
    assert.equal(type(["1", "2", ".", "5", "0", "9"]), "12.50");
    assert.equal(type([".", "5"]), "0.5");
    assert.equal(type(["0", "7"]), "7");
    assert.equal(type(["1", ".", ".", "2"]), "1.2");
    assert.equal(type(["4", "2", "back"]), "4");
    assert.equal(type(["4", "2", "clear"]), "");
    assert.equal(type(Array(12).fill("9")), "999999999");
  });

  it("cashier live payment maps order status to phases", async () => {
    const { paymentPhase } = await import("../src/merchant/cashier/cashierLogic.ts");
    assert.equal(paymentPhase("pending_payment"), "waiting");
    assert.equal(paymentPhase("verifying"), "confirming");
    assert.equal(paymentPhase("completed"), "paid");
    assert.equal(paymentPhase("payment_anomaly"), "attention");
    assert.equal(paymentPhase("expired"), "closed");
  });

  it("cashier shift totals count completed volume, open, and attention", async () => {
    const { shiftTotals } = await import("../src/merchant/cashier/cashierLogic.ts");
    const o = (status, usd) => ({ status, invoiceAmountUsd: usd });
    assert.deepEqual(
      shiftTotals([
        o("completed", "10.50"),
        o("completed", "4.50"),
        o("pending_payment"),
        o("verifying"),
        o("payment_anomaly"),
        o("expired"),
      ]),
      { count: 6, completed: 2, completedUsd: 15, open: 2, attention: 1 },
    );
  });

  it("gives cashiers their own shell and terminal routes", () => {
    const app = read("src/merchant/MerchantApp.tsx");
    assert.match(app, /experience === "cashier" \? \(\s*<CashierShell/);
    const cashier = app.split("function cashierRoutes")[1]?.split("function backOfficeRoutes")[0] ?? "";
    assert.match(cashier, /<Route index element=\{<CashierHomePage/);
    assert.match(read("src/merchant/cashier/CashierHomePage.tsx"), /<PayPadPage session=\{session\} \/>/);
    assert.match(cashier, /path="pay\/:orderId"/);
    assert.match(cashier, /path="shift"/);
    const shell = read("src/merchant/cashier/CashierShell.tsx");
    assert.match(shell, /id="platform-topbar-center"/);
    assert.match(shell, /id="platform-topbar-actions"/);
    const pad = read("src/merchant/cashier/PayPadPage.tsx");
    assert.match(pad, /mode_b_amount_in_use/);
    assert.match(pad, /sessionLiveActionsUnlocked/);
    const live = read("src/merchant/cashier/LivePaymentPage.tsx");
    assert.match(live, /canCancelPendingOrder/);
    assert.match(live, /payload=\{qrValue\}/);
    assert.match(live, /addressOnly \? receiveAddress : \(pay\?\.qrPayload/);
    assert.match(live, /QrCenterNetworkMark network=\{network\}/);
    const shift = read("src/merchant/cashier/ShiftPage.tsx");
    assert.match(shift, /createdBy: session\.userId/);
  });

  it("gives sites the merchant dashboard without service bills or platform fee", () => {
    const app = read("src/merchant/MerchantApp.tsx");
    assert.match(app, /<DashboardPage session=\{session\} isSite=\{experience === "site"\} \/>/);
    const dash = read("src/merchant/DashboardPage.tsx");
    assert.match(dash, /isSite \? Promise\.resolve\(null\) : getMerchantCommercial/);
    assert.match(dash, /sitesInMerchantSubtree\(orgs, isSite \? orgId : parentId \?\? orgId\)/);
    assert.match(dash, /const openBills = isSite \? 0 : kpis\.openBills/);
    assert.match(dash, /label="Expiring Soon"/);
    assert.match(dash, /cashier: userId/);
    assert.doesNotMatch(dash, /site-dash__settlement/);
    const prefetch = read("src/shared/prefetchPortalDashboardData.ts");
    assert.match(prefetch, /periodWindow\("mtd"\)/);
    assert.match(prefetch, /experience !== "site"\) void getMerchantCommercial/);
  });

  it("hides service bills from site nav, dashboard links, and alerts", () => {
    const shell = read("src/merchant/MerchantShell.tsx");
    assert.match(shell, /function siteNavGroups/);
    assert.match(shell, /merchantRoute\("service-bills"\)\]\)/);
    const dash = read("src/merchant/DashboardPage.tsx");
    assert.doesNotMatch(dash, /cashierOnly|experience/);
    assert.match(dash, /openBills > 0\s*\? merchantRoute\("service-bills"\)/);
    assert.match(dash, /\{isSite \? \(\s*<DashKpiCard/);
    assert.match(dash, /sitesInMerchantSubtree/);
    const alerts = read("src/merchant/merchantAlerts.ts");
    assert.match(alerts, /showBills \? loadBillingAlerts/);
    assert.match(alerts, /const billHref = billId && billsVisible/);
  });

  it("merges cashier sales with members so idle cashiers and POS PIN status show", () => {
    const report = [
      { userId: "u1", email: "a@x.io", count: 3, volumeUsd: 90 },
      { userId: "owner", email: "o@x.io", count: 1, volumeUsd: 200 },
      { userId: null, email: null, count: 1, volumeUsd: 5 },
    ];
    const member = (userId, email, extra = {}) => ({
      orgId: "site-1",
      userId,
      email,
      role: "cashier",
      orgType: "site",
      status: "active",
      ...extra,
    });
    const rows = mergeCashierRows(report, [
      member("u1", "a@x.io", { posPinConfigured: true }),
      member("u2", "b@x.io", { posPinConfigured: false }),
      member("u3", "c@x.io", { status: "paused" }),
      member("u1", "a@x.io", { orgId: "site-2" }),
      { ...member("admin", "adm@x.io"), role: "admin" },
    ]);
    assert.deepEqual(
      rows.map((r) => [r.userId, r.count, r.posPin, r.paused]),
      [
        ["owner", 1, null, false],
        ["u1", 3, true, false],
        ["u2", 0, false, false],
        ["u3", 0, null, true],
      ],
    );
    assert.equal(mergeCashierRows(report, null).every((r) => r.posPin === null), true);

    const table = read("src/merchant/dashboard/CashiersTable.tsx");
    assert.match(table, /without POS PIN/);
    const store = read("../api/src/orgs/membership-store.mjs");
    assert.match(store, /pos_pin_hash IS NOT NULL AS pos_pin_configured/);
    assert.doesNotMatch(store, /u\.pos_pin_hash,/);
  });

  it("scopes mixed-membership sessions to one workspace", () => {
    const full = {
      userId: "u",
      memberships: [
        { orgId: "site-9", orgType: "merchant_site", role: "cashier" },
        { orgId: "m-1", orgType: "merchant", role: "owner" },
        { orgId: "site-2", orgType: "merchant_site", role: "administrator" },
        { orgId: "ag-1", orgType: "agent", role: "owner" },
      ],
    };
    const ws = sessionWorkspaces(full);
    assert.deepEqual(ws.map((w) => w.orgId), ["site-9", "m-1", "site-2"]);
    assert.equal(defaultWorkspaceOrgId(ws), "m-1");
    assert.equal(
      defaultWorkspaceOrgId(ws.filter((w) => w.orgId !== "m-1")),
      "site-2",
    );
    assert.equal(resolveWorkspaceOrgId(ws, "site-9"), "site-9");
    assert.equal(resolveWorkspaceOrgId(ws, "gone"), "m-1");

    const cashier = scopeSessionToWorkspace(full, "site-9");
    assert.equal(resolveMerchantExperience(cashier), "cashier");
    assert.equal(resolveMerchantExperience(scopeSessionToWorkspace(full, "site-2")), "site");
    assert.equal(resolveMerchantExperience(scopeSessionToWorkspace(full, "m-1")), "merchant");

    const edited = { ...cashier, firstName: "Ann" };
    const restored = unscopeSession(edited, cashier, full);
    assert.equal(restored.firstName, "Ann");
    assert.equal(restored.memberships, full.memberships);
    const fresh = { ...full, memberships: [full.memberships[1]] };
    assert.equal(unscopeSession(fresh, cashier, full), fresh);

    const single = session(m("merchant", "owner"));
    assert.equal(scopeSessionToWorkspace(single, "merchant-owner"), single);
    const paused = {
      memberships: [
        { orgId: "a", orgType: "merchant", role: "owner", status: "paused" },
        { orgId: "b", orgType: "merchant_site", role: "cashier" },
      ],
    };
    assert.deepEqual(sessionWorkspaces(paused).map((w) => w.orgId), ["b"]);

    const app = read("src/merchant/MerchantApp.tsx");
    assert.match(app, /WorkspaceSwitcherContext\.Provider/);
    assert.match(app, /<Routes key=\{activeOrgId/);
    for (const shell of ["src/merchant/MerchantShell.tsx", "src/merchant/cashier/CashierShell.tsx"]) {
      assert.match(read(shell), /menuExtra=\{\(close\) => <WorkspaceMenuSection/);
    }
    assert.match(read("src/merchant/cashier/PayPadPage.tsx"), /orgId: primaryMerchantOrgId\(session\)/);
    assert.match(read("src/merchant/MerchantOrdersRoutes.tsx"), /<Navigate to=\{merchantRoute\("charge"\)\} replace \/>/);
    assert.match(read("src/merchant/DashboardPage.tsx"), /useWorkspaceScopeOrgId\(/);
    assert.match(read("src/merchant/DashboardPage.tsx"), /orgId: scopeOrgId, tz \}/);
  });
});
