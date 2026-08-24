import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OrgType,
  UserRole,
  OrderStatus,
  MatchingMode,
  AddressSource,
  DEFAULT_ASSET_NETWORK,
  AssetCode,
  NetworkId,
  PaymentOrderColumn,
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

  it("exports payment-order DB columns for matching assign", () => {
    assert.equal(PaymentOrderColumn.matchingMode, "matching_mode");
    assert.equal(PaymentOrderColumn.payableAmount, "payable_amount");
    assert.equal(PaymentOrderColumn.receiveAddress, "receive_address");
    assert.equal(PaymentOrderColumn.addressSource, "address_source");
    assert.equal(PaymentOrderColumn.hdIndex, "hd_index");
    assert.equal(PaymentOrderColumn.memoOrTag, "memo_or_tag");
    assert.equal(AddressSource.Main, "main");
    assert.equal(AddressSource.HdPool, "hd_pool");
  });
});
