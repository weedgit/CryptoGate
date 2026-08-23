import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OrgType,
  UserRole,
  OrderStatus,
  MatchingMode,
  DEFAULT_ASSET_NETWORK,
  AssetCode,
  NetworkId,
} from "../dist/index.js";

describe("@cryptogate/domain", () => {
  it("exports org types used by Business-Model", () => {
    assert.equal(OrgType.Platform, "platform");
    assert.equal(OrgType.MerchantSite, "merchant_site");
  });

  it("restricts cashier naming to role enum", () => {
    assert.equal(UserRole.Cashier, "cashier");
  });

  it("includes payment anomaly status", () => {
    assert.equal(OrderStatus.PaymentAnomaly, "payment_anomaly");
  });

  it("exposes Phase 1 matching modes B C D S", () => {
    assert.deepEqual(
      [MatchingMode.B, MatchingMode.C, MatchingMode.D, MatchingMode.S],
      ["B", "C", "D", "S"],
    );
  });

  it("defaults first network to USDT on Tron", () => {
    assert.equal(DEFAULT_ASSET_NETWORK.asset, AssetCode.USDT);
    assert.equal(DEFAULT_ASSET_NETWORK.network, NetworkId.Tron);
  });
});
