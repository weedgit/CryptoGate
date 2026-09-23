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
  });
});
