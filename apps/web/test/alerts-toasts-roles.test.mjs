import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dismissToast, showToast, subscribeToast } from "../src/shared/toast.ts";
import {
  normalizeRoleKey,
  rolePermissionSummary,
} from "../src/shared/rolePermissions.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

describe("app-wide toast slot", () => {
  it("shows one toast at a time and dismisses the replaced one", () => {
    const seen = [];
    const unsub = subscribeToast((entry) => seen.push(entry?.message ?? null));
    let firstDismissed = 0;
    showToast("First", { onDismiss: () => firstDismissed++ });
    showToast("Second", { tone: "ok" });
    assert.equal(firstDismissed, 1);
    assert.equal(seen.at(-1), "Second");
    dismissToast();
    assert.equal(seen.at(-1), null);
    unsub();
  });

  it("refreshes instead of stacking identical text", () => {
    let dismissed = 0;
    const a = showToast("Same", { onDismiss: () => dismissed++ });
    const b = showToast("Same");
    assert.notEqual(a, b);
    assert.equal(dismissed, 0);
    dismissToast(a);
    assert.equal(dismissed, 0, "stale id does not dismiss the refreshed toast");
    dismissToast(b);
    assert.equal(dismissed, 1);
  });

  it("ignores blank messages", () => {
    assert.equal(showToast("   "), 0);
  });
});

describe("sidebar role & permission copy", () => {
  it("normalizes unknown roles to viewer", () => {
    assert.equal(normalizeRoleKey("owner"), "owner");
    assert.equal(normalizeRoleKey("cashier"), "cashier");
    assert.equal(normalizeRoleKey(undefined), "viewer");
    assert.equal(normalizeRoleKey("staff"), "viewer");
  });

  it("marks Owner-only actions for Administrators", () => {
    const platformAdmin = rolePermissionSummary("platform", "administrator");
    assert.equal(platformAdmin.cannot?.label, "Owner only");
    assert.ok(platformAdmin.cannot?.items.includes("Merchant settlement wallet and xPub"));
    const merchantAdmin = rolePermissionSummary("merchant", "administrator");
    assert.ok(merchantAdmin.cannot?.items.includes("Settlement wallet and xPub"));
    assert.ok(!merchantAdmin.can.includes("Settlement wallet and xPub (MFA + cool-down)"));
  });

  it("describes Viewer and Cashier limits", () => {
    for (const portal of ["platform", "agent", "merchant"]) {
      const viewer = rolePermissionSummary(portal, "viewer");
      assert.equal(viewer.summary, "Read-only");
      assert.equal(viewer.cannot?.label, "Hidden for Viewers");
    }
    const cashier = rolePermissionSummary("merchant", "cashier");
    assert.equal(cashier.summary, "Own orders only");
    assert.equal(rolePermissionSummary("platform", "owner").cannot, null);
  });
});

describe("banners moved to dock, sidebar, and toasts", () => {
  it("renders the role card in every shell and no role banners", () => {
    for (const shell of [
      "src/platform/PlatformShell.tsx",
      "src/agent/AgentShell.tsx",
      "src/merchant/MerchantShell.tsx",
    ]) {
      const src = read(shell);
      assert.match(src, /<SidebarRoleCard/);
      assert.doesNotMatch(src, /read-only access/i);
    }
  });

  it("dock says waiting for self-clearing alerts", () => {
    const dock = read("src/shared/UnresolvedAlertsBanner.tsx");
    assert.match(dock, /waiting to clear/);
    assert.match(dock, /a\.waiting/);
    const merchant = read("src/merchant/merchantAlerts.ts");
    assert.match(merchant, /maintenance:/);
    assert.match(merchant, /suspended:/);
    assert.match(merchant, /waiting: true/);
  });

  it("removes the merchant dashboard alert box", () => {
    const dash = read("src/merchant/DashboardPage.tsx");
    assert.doesNotMatch(dash, /merchant-dash__alerts/);
  });

  it("uses toasts for one-time results", () => {
    const security = read("src/auth/SecuritySettingsPage.tsx");
    assert.doesNotMatch(security, /banner banner-ok|banner banner-error/);
    const login = read("src/auth/PortalLoginPage.tsx");
    assert.doesNotMatch(login, /banner banner-ok/);
    assert.match(login, /banner banner-warn/, "expired link stays inline");
    const agentCard = read("src/platform/AgentDetailCard.tsx");
    assert.doesNotMatch(agentCard, /b3-agent-detail__toast/);
  });
});
