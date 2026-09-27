import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canChangeSettlementSettings, canManageMerchantOrgOps } from "../src/orgs/role-policy.mjs";
import { resolveOrgSuspendBlock } from "../src/orgs/org-ancestry.mjs";

describe("fund rails Owner-only", () => {
  const merchant = { id: "m1", type: "merchant" };

  it("Platform Owner may change settlement; Platform Admin may not", () => {
    assert.equal(
      canChangeSettlementSettings(
        { platformOwner: true, platformOperator: true, memberships: [] },
        merchant,
      ),
      true,
    );
    assert.equal(
      canChangeSettlementSettings(
        { platformOwner: false, platformOperator: true, memberships: [] },
        merchant,
      ),
      false,
    );
  });

  it("Platform Admin may still manage non-fund org ops", () => {
    assert.equal(
      canManageMerchantOrgOps(
        { platformOwner: false, platformOperator: true, memberships: [] },
        merchant,
      ),
      true,
    );
  });
});

describe("resolveOrgSuspendBlock", () => {
  it("blocks when org itself is paused", async () => {
    const block = await resolveOrgSuspendBlock({
      id: "m1",
      type: "merchant",
      status: "paused",
      status_reason: "Manual review",
    });
    assert.equal(block.blocked, true);
    assert.equal(block.reason, "Manual review");
  });

  it("allows active merchant", async () => {
    const block = await resolveOrgSuspendBlock({
      id: "m1",
      type: "merchant",
      status: "active",
    });
    assert.equal(block.blocked, false);
  });
});
