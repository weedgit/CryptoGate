import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MerchantTier } from "@paymentgate/domain";
import {
  validateFeeTierBand,
  validateUpdateFeeTierSettingsBody,
  isPercentWithinBand,
  nextBillingPeriodStart,
} from "../src/platform-settings/fee-tier-rules.mjs";
import {
  validateCommercialAgainstBand,
  validateUpdateMerchantCommercialBody,
} from "../src/commercial/merchant-commercial-rules.mjs";
import {
  canReadFeeTierBands,
  canReadPlatformOrgPolicy,
  canUpdatePlatformOwnerSettings,
} from "../src/orgs/role-policy.mjs";
import { defaultFeeTierBandRow } from "../src/platform-settings/fee-tier-store.mjs";

describe("fee tier rules (X-01 v0.3.3)", () => {
  it("validates band min ≤ default ≤ max", () => {
    const ok = validateFeeTierBand({
      tier: MerchantTier.Small,
      subscriptionAmountUsd: "49.00",
      volumeFeeMinPercent: "1.2",
      volumeFeeMaxPercent: "2.0",
      defaultSignupPercent: "2.0",
    });
    assert.equal(ok.ok, true);

    const bad = validateFeeTierBand({
      tier: MerchantTier.Small,
      subscriptionAmountUsd: "49.00",
      volumeFeeMinPercent: "2.0",
      volumeFeeMaxPercent: "1.0",
      defaultSignupPercent: "1.5",
    });
    assert.equal(bad.ok, false);
  });

  it("requires all three tiers on PUT body", () => {
    const bad = validateUpdateFeeTierSettingsBody({
      tiers: [
        {
          tier: MerchantTier.Small,
          subscriptionAmountUsd: "49.00",
          volumeFeeMinPercent: "1.2",
          volumeFeeMaxPercent: "2.0",
          defaultSignupPercent: "2.0",
        },
      ],
    });
    assert.equal(bad.ok, false);
  });

  it("checks percent within band", () => {
    const band = {
      volume_fee_min_percent: "1.2",
      volume_fee_max_percent: "2.0",
    };
    assert.equal(isPercentWithinBand("1.5", band), true);
    assert.equal(isPercentWithinBand("2.5", band), false);
  });

  it("next billing period is ISO date", () => {
    assert.match(nextBillingPeriodStart(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("merchant commercial rules (X-01)", () => {
  it("rejects non-enterprise rate outside band", () => {
    const band = {
      subscription_amount_usd: "49.00",
      volume_fee_min_percent: "1.2",
      volume_fee_max_percent: "2.0",
    };
    const result = validateCommercialAgainstBand(
      MerchantTier.Small,
      "3.0",
      band,
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "rate_outside_band");
  });

  it("enterprise outside band queues approval", () => {
    const band = {
      subscription_amount_usd: "0.00",
      volume_fee_min_percent: "0.5",
      volume_fee_max_percent: "1.0",
    };
    const result = validateCommercialAgainstBand(
      MerchantTier.Enterprise,
      "1.5",
      band,
    );
    assert.equal(result.ok, true);
    assert.equal(result.needsApproval, true);
  });

  it("validates update body", () => {
    const ok = validateUpdateMerchantCommercialBody(
      { tier: "mid", volumeFeePercent: "1.2" },
      "small",
    );
    assert.equal(ok.ok, true);
  });

  it("accepts mid onboard fee against domain default band row", () => {
    const band = defaultFeeTierBandRow(MerchantTier.Mid);
    assert.ok(band);
    const result = validateCommercialAgainstBand(MerchantTier.Mid, "1.2", band);
    assert.equal(result.ok, true);
  });

  it("rejects create when band row is missing and no default applies", () => {
    const result = validateCommercialAgainstBand(MerchantTier.Mid, "1.2", null);
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid_band");
  });
});

describe("X-01 role policy", () => {
  it("platform owner may update owner-only settings", () => {
    assert.equal(
      canUpdatePlatformOwnerSettings({
        platformOwner: true,
        memberships: [{ orgType: "platform", role: "owner" }],
      }),
      true,
    );
    assert.equal(
      canUpdatePlatformOwnerSettings({
        platformOwner: false,
        platformOperator: true,
        memberships: [{ orgType: "platform", role: "administrator" }],
      }),
      false,
    );
  });

  it("cashier cannot read fee tiers", () => {
    assert.equal(
      canReadFeeTierBands({
        platformOperator: false,
        memberships: [{ orgType: "merchant", role: "cashier" }],
      }),
      false,
    );
  });

  it("platform viewer may read org policy", () => {
    assert.equal(
      canReadPlatformOrgPolicy({
        memberships: [{ orgType: "platform", role: "viewer" }],
      }),
      true,
    );
  });
});
