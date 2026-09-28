import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("contact / org setup UI", () => {
  it("unlocks live actions from setupReady with activationPaid gate", () => {
    const src = readFileSync(
      join(root, "src/auth/contactVerification.ts"),
      "utf8",
    );
    assert.match(src, /setupReady/);
    assert.match(src, /contactVerified/);
    assert.match(src, /activationPaid/);
    assert.match(src, /sessionLiveActionsUnlocked/);
    assert.match(src, /sessionNeedsActivationPayment/);
    assert.match(src, /ACTIVATION_PAYMENT_LOCKED_HINT/);
    assert.match(src, /setupChecklistItems/);
    assert.match(src, /missingSetupPartsLabel/);
  });

  it("shows setup checklist on merchant settings; agent steps open the org window", () => {
    const agentLinks = readFileSync(
      join(root, "src/auth/contactVerification.ts"),
      "utf8",
    );
    const team = readFileSync(
      join(root, "src/merchant/TeamSettingsPage.tsx"),
      "utf8",
    );
    const integrations = readFileSync(
      join(root, "src/merchant/IntegrationsPage.tsx"),
      "utf8",
    );
    assert.match(agentLinks, /ORG_EDIT_PARAM/);
    assert.match(agentLinks, /PROFILE_EDIT_PARAM/);
    assert.match(team, /SetupChecklistCard/);
    assert.match(team, /sessionLiveActionsUnlocked/);
    assert.match(integrations, /SetupChecklistCard/);
    assert.match(integrations, /canWrite/);
  });

  it("moves setup and activation to dock alerts (no shell banners)", () => {
    const merchant = readFileSync(
      join(root, "src/merchant/MerchantShell.tsx"),
      "utf8",
    );
    const agent = readFileSync(join(root, "src/agent/AgentShell.tsx"), "utf8");
    assert.doesNotMatch(merchant, /VerifyContactBanner|ActivationPaymentBanner/);
    assert.doesNotMatch(agent, /VerifyContactBanner/);
    assert.match(merchant, /OrgSetupModalHost/);
    assert.match(merchant, /portal="merchant"/);
    assert.match(agent, /OrgSetupModalHost/);
    assert.match(agent, /portal="agent"/);
    const host = readFileSync(
      join(root, "src/auth/OrgSetupModalHost.tsx"),
      "utf8",
    );
    assert.match(host, /SETUP_QUERY_PARAM/);
    const verification = readFileSync(
      join(root, "src/auth/contactVerification.ts"),
      "utf8",
    );
    assert.match(verification, /export function setupAlertHref/);
    const checklist = readFileSync(
      join(root, "src/auth/SetupChecklistCard.tsx"),
      "utf8",
    );
    assert.match(checklist, /Watch-only/);
    const alerts = readFileSync(
      join(root, "src/merchant/merchantAlerts.ts"),
      "utf8",
    );
    assert.match(alerts, /Watch-only until setup is complete/);
    assert.match(alerts, /Pay activation fee/);
    assert.match(alerts, /OPEN_ACTIVATION_QUERY/);
    assert.match(alerts, /setup:/);
    assert.match(alerts, /activation:/);
    const agentAlerts = readFileSync(join(root, "src/agent/agentAlerts.ts"), "utf8");
    assert.match(agentAlerts, /setupAlertHref\("agent"\)/);
    const bills = readFileSync(
      join(root, "src/merchant/ServiceBillsListPage.tsx"),
      "utf8",
    );
    assert.doesNotMatch(bills, /plat-bills__activation-callout/);
  });
});
