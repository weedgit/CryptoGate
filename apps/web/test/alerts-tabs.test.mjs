import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

describe("@paymentgate/web Alerts tabs (per-member settings)", () => {
  for (const portal of ["merchant", "agent", "platform"]) {
    it(`${portal} shell has an Alerts nav entry and route`, () => {
      const shell = read(
        `src/${portal}/${portal[0].toUpperCase()}${portal.slice(1)}Shell.tsx`,
      );
      assert.match(shell, /label: "Alerts"/);
      assert.match(shell, /settings\/notifications/);
      const app = read(`src/${portal}/${portal[0].toUpperCase()}${portal.slice(1)}App.tsx`);
      assert.match(app, /settings\/notifications/);
    });
  }

  it("all portals use the shared AlertSettingsPage", () => {
    assert.match(read("src/merchant/NotificationsSettingsPage.tsx"), /<AlertSettingsPage/);
    assert.match(read("src/agent/AgentNotificationSettings.tsx"), /<AlertSettingsPage/);
    assert.match(read("src/platform/PlatformAlertsSettingsPage.tsx"), /<AlertSettingsPage/);
  });

  it("agent alert settings moved out of the profile menu", () => {
    assert.doesNotMatch(read("src/agent/AgentShell.tsx"), /profileExtra=/);
  });

  it("platform in-app alerts respect the member's switches", () => {
    assert.match(read("src/platform/PlatformShell.tsx"), /platform_system_health/);
    assert.match(read("src/platform/platformConditionAlerts.ts"), /platform_commission_stuck/);
  });
});
