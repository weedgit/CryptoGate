import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NetworkId } from "@paymentgate/domain";
import {
  compareAmount,
  registryNetworkFloors,
  resolveRailPolicy,
  validatePutMerchantRailSettingsBody,
  validatePutPlatformRailSettingsBody,
  validatePutScopedRailSettingsBody,
} from "../src/platform-settings/network-rail-settings-rules.mjs";

describe("network rail settings rules", () => {
  it("compareAmount orders major-unit decimals", () => {
    assert.equal(compareAmount("0.01", "0.02"), -1);
    assert.equal(compareAmount("1", "1.0"), 0);
    assert.equal(compareAmount("10", "2"), 1);
  });

  it("registryNetworkFloors returns tron USDT/TRX floors", () => {
    const floors = registryNetworkFloors(NetworkId.Tron);
    assert.ok(floors.requiredConfirmations != null);
    assert.ok(floors.requiredConfirmations >= 19);
    assert.equal(floors.primaryAsset, "USDT");
  });

  it("platform minAmount requires asset and may not go below that pair's floor", () => {
    const missingAsset = validatePutPlatformRailSettingsBody(
      { minAmount: "0.01" },
      NetworkId.Ethereum,
    );
    assert.equal(missingAsset.ok, false);

    const bad = validatePutPlatformRailSettingsBody(
      { asset: "ETH", minAmount: "0.0001" },
      NetworkId.Ethereum,
    );
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.code, "min_amount_below_registry");

    const ok = validatePutPlatformRailSettingsBody(
      { asset: "ETH", minAmount: "0.002" },
      NetworkId.Ethereum,
    );
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.asset, "ETH");
      assert.equal(ok.minAmount, "0.002");
    }
  });

  it("platform may not set minAmount below registry floor", () => {
    const bad = validatePutPlatformRailSettingsBody(
      { asset: "USDT", minAmount: "0.0001" },
      NetworkId.Tron,
    );
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.code, "min_amount_below_registry");
  });

  it("platform may raise confirmations", () => {
    const ok = validatePutPlatformRailSettingsBody(
      { requiredConfirmations: 40 },
      NetworkId.Tron,
    );
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.requiredConfirmations, 40);
  });

  it("merchant may not go below platform floor", () => {
    const bad = validatePutMerchantRailSettingsBody(
      { requiredConfirmations: 5 },
      NetworkId.Tron,
      19,
    );
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.code, "confirmations_below_platform");
  });

  it("resolveRailPolicy applies platform then merchant raise", () => {
    const base = resolveRailPolicy("USDT", NetworkId.Tron, {});
    assert.ok(base);
    const withPlatform = resolveRailPolicy("USDT", NetworkId.Tron, {
      platform: { requiredConfirmations: 25, minAmount: "1" },
    });
    assert.equal(withPlatform?.requiredConfirmations, 25);
    assert.equal(withPlatform?.minAmount, "1");
    const withMerchant = resolveRailPolicy("USDT", NetworkId.Tron, {
      platform: { requiredConfirmations: 25, minAmount: "1" },
      merchant: { requiredConfirmations: 40 },
    });
    assert.equal(withMerchant?.requiredConfirmations, 40);
    assert.equal(withMerchant?.platformFloorConfirmations, 25);
  });

  it("merchant below platform floor is ignored", () => {
    const resolved = resolveRailPolicy("USDT", NetworkId.Tron, {
      platform: { requiredConfirmations: 25, minAmount: null },
      merchant: { requiredConfirmations: 10 },
    });
    assert.equal(resolved?.requiredConfirmations, 25);
  });

  it("scoped overlay may not go below parent floor", () => {
    const badConfirms = validatePutScopedRailSettingsBody(
      { requiredConfirmations: 10 },
      NetworkId.Tron,
      {
        parentConfirmations: 25,
        parentMinAmountForAsset: () => "1",
      },
    );
    assert.equal(badConfirms.ok, false);
    if (!badConfirms.ok) assert.equal(badConfirms.code, "confirmations_below_parent");

    const badMin = validatePutScopedRailSettingsBody(
      { asset: "USDT", minAmount: "0.5" },
      NetworkId.Tron,
      {
        parentConfirmations: 25,
        parentMinAmountForAsset: () => "1",
      },
    );
    assert.equal(badMin.ok, false);
    if (!badMin.ok) assert.equal(badMin.code, "min_amount_below_parent");

    const ok = validatePutScopedRailSettingsBody(
      { requiredConfirmations: 30, asset: "USDT", minAmount: "2" },
      NetworkId.Tron,
      {
        parentConfirmations: 25,
        parentMinAmountForAsset: () => "1",
      },
    );
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.requiredConfirmations, 30);
      assert.equal(ok.minAmount, "2");
    }
  });

  it("inheritance: registry → global → merchant → site → self-serve", () => {
    const chain = resolveRailPolicy("USDT", NetworkId.Tron, {
      platform: { requiredConfirmations: 20, minAmount: "1" },
      platformMerchant: { requiredConfirmations: 30, minAmount: "2" },
      platformSite: { requiredConfirmations: 40, minAmount: "5" },
      merchant: { requiredConfirmations: 50 },
    });
    assert.equal(chain?.requiredConfirmations, 50);
    assert.equal(chain?.minAmount, "5");
    assert.equal(chain?.platformFloorConfirmations, 20);
    assert.equal(chain?.merchantFloorConfirmations, 30);
  });

  it("site wins over merchant when raised; inherits when unset", () => {
    const siteWins = resolveRailPolicy("USDT", NetworkId.Tron, {
      platform: { requiredConfirmations: 20, minAmount: "1" },
      platformMerchant: { requiredConfirmations: 30, minAmount: "2" },
      platformSite: { requiredConfirmations: 45, minAmount: "3" },
    });
    assert.equal(siteWins?.requiredConfirmations, 45);
    assert.equal(siteWins?.minAmount, "3");

    const siteInherit = resolveRailPolicy("USDT", NetworkId.Tron, {
      platform: { requiredConfirmations: 20, minAmount: "1" },
      platformMerchant: { requiredConfirmations: 30, minAmount: "2" },
      platformSite: { requiredConfirmations: null, minAmount: null },
    });
    assert.equal(siteInherit?.requiredConfirmations, 30);
    assert.equal(siteInherit?.minAmount, "2");
  });

  it("below-parent site overlay is ignored at resolve time", () => {
    const resolved = resolveRailPolicy("USDT", NetworkId.Tron, {
      platform: { requiredConfirmations: 20, minAmount: "1" },
      platformMerchant: { requiredConfirmations: 30, minAmount: "2" },
      platformSite: { requiredConfirmations: 10, minAmount: "0.5" },
    });
    assert.equal(resolved?.requiredConfirmations, 30);
    assert.equal(resolved?.minAmount, "2");
  });

  it("null overlay inherits parent floor for order snapshot", () => {
    const cleared = resolveRailPolicy("USDT", NetworkId.Tron, {
      platform: { requiredConfirmations: 22, minAmount: "1.5" },
      platformMerchant: { requiredConfirmations: null, minAmount: null },
      platformSite: { requiredConfirmations: null, minAmount: null },
    });
    assert.equal(cleared?.requiredConfirmations, 22);
    assert.equal(cleared?.minAmount, "1.5");
  });
});
