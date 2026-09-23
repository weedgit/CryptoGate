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

  it("shows setup checklist on agent and merchant settings", () => {
    const agent = readFileSync(
      join(root, "src/agent/AgentSettingsPage.tsx"),
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
    assert.match(agent, /SetupChecklistCard/);
    assert.match(team, /SetupChecklistCard/);
    assert.match(team, /sessionLiveActionsUnlocked/);
    assert.match(integrations, /SetupChecklistCard/);
    assert.match(integrations, /canWrite/);
  });

  it("shows setup and activation banners on merchant shell", () => {
    const merchant = readFileSync(
      join(root, "src/merchant/MerchantShell.tsx"),
      "utf8",
    );
    const agent = readFileSync(join(root, "src/agent/AgentShell.tsx"), "utf8");
    assert.match(merchant, /VerifyContactBanner/);
    assert.match(merchant, /ActivationPaymentBanner/);
    assert.match(merchant, /portal="merchant"/);
    assert.match(agent, /VerifyContactBanner/);
    assert.match(agent, /portal="agent"/);
    const banner = readFileSync(
      join(root, "src/auth/VerifyContactBanner.tsx"),
      "utf8",
    );
    assert.match(banner, /Watch-only/);
    const checklist = readFileSync(
      join(root, "src/auth/SetupChecklistCard.tsx"),
      "utf8",
    );
    assert.match(checklist, /Watch-only/);
    const activation = readFileSync(
      join(root, "src/merchant/ActivationPaymentBanner.tsx"),
      "utf8",
    );
    assert.match(activation, /Watch-only/);
  });
});
