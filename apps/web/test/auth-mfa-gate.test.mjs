import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("MFA step-up gate", () => {
  it("routes unenrolled users to enroll-first guidance", () => {
    const gate = readFileSync(
      join(root, "src/auth/MfaStepUpGate.tsx"),
      "utf8",
    );
    assert.match(gate, /MfaEnrollRequiredModal/);
    assert.match(gate, /sessionMfaEnrolled/);
    assert.match(gate, /sessionCanEnrollMfa/);

    const modal = readFileSync(
      join(root, "src/auth/MfaEnrollRequiredModal.tsx"),
      "utf8",
    );
    assert.match(modal, /Profile from the sidebar/);
    assert.match(modal, /enrollmentPending/);
  });

  it("wires MfaStepUpGate on privileged save flows", () => {
    for (const file of [
      "src/merchant/SettlementPage.tsx",
      "src/agent/AgentSettingsPage.tsx",
      "src/platform/ComplianceOverrideModal.tsx",
    ]) {
      const src = readFileSync(join(root, file), "utf8");
      assert.match(src, /MfaStepUpGate/, `${file} should use MfaStepUpGate`);
      assert.doesNotMatch(
        src,
        /MfaStepUpModal/,
        `${file} should not import MfaStepUpModal directly`,
      );
    }
  });

  it("passes session into compliance override MFA gate", () => {
    const card = readFileSync(
      join(root, "src/platform/MerchantDetailCard.tsx"),
      "utf8",
    );
    assert.match(card, /session={session}/);
    const list = readFileSync(
      join(root, "src/platform/MerchantsListPage.tsx"),
      "utf8",
    );
    assert.match(list, /session={session}/);
  });
});
