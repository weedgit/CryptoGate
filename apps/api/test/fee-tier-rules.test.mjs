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
  it("accepts volume breakpoints and agent commission", () => {
    const ok = validateFeeTierBand({
      tier: MerchantTier.Small,
      subscriptionAmountUsd: "49.00",
      volumeFeeMinPercent: "1.2",
      volumeFeeMaxPercent: "2.0",
      defaultSignupPercent: "2.0",
      volumeMinUsd: "0",
      volumeMaxUsd: "50000",
      agentCommissionPercent: "15",
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.band.agentCommissionPercent, "15");
      assert.equal(ok.band.volumeMinUsd, "0");
    }
  });

  it("parses effectiveTiming on PUT body", () => {
    const body = {
      tiers: [
        {
          tier: MerchantTier.Small,
          subscriptionAmountUsd: "49.00",
          volumeFeeMinPercent: "1.2",
          volumeFeeMaxPercent: "2.0",
          defaultSignupPercent: "2.0",
          volumeMinUsd: "0",
          volumeMaxUsd: "50000",
          agentCommissionPercent: "15",
        },
        {
          tier: MerchantTier.Mid,
          subscriptionAmountUsd: "199.00",
          volumeFeeMinPercent: "0.8",
          volumeFeeMaxPercent: "1.5",
          defaultSignupPercent: "1.2",
          volumeMinUsd: "50000",
          volumeMaxUsd: "500000",
          agentCommissionPercent: "18",
        },
        {
          tier: MerchantTier.Enterprise,
          subscriptionAmountUsd: "0.00",
          volumeFeeMinPercent: "0.5",
          volumeFeeMaxPercent: "1.0",
          defaultSignupPercent: "0.8",
          volumeMinUsd: "500000",
          volumeMaxUsd: null,
          agentCommissionPercent: "20",
        },
      ],
      effectiveTiming: "immediate",
    };
    const ok = validateUpdateFeeTierSettingsBody(body);
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.effectiveTiming, "immediate");
  });
});

describe("resolveTierForVolume", () => {
  it("picks tier by volume breakpoints", async () => {
    const { resolveTierForVolume } = await import(
      "../src/platform-settings/fee-tier-rules.mjs"
    );
    const bands = [
      { tier: "small", volume_min_usd: "0", volume_max_usd: "50000" },
      { tier: "mid", volume_min_usd: "50000", volume_max_usd: "500000" },
      { tier: "enterprise", volume_min_usd: "500000", volume_max_usd: null },
    ];
    assert.equal(resolveTierForVolume(0, bands), "small");
    assert.equal(resolveTierForVolume(49999, bands), "small");
    assert.equal(resolveTierForVolume(50000, bands), "mid");
    assert.equal(resolveTierForVolume(500000, bands), "enterprise");
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
