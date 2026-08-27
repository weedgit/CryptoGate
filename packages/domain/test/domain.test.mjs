import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OrgType,
  UserRole,
  MembershipStatus,
  OrderStatus,
  MatchingMode,
  AddressSource,
  DEFAULT_ASSET_NETWORK,
  AssetCode,
  MerchantTier,
  DEFAULT_FEE_TIER_BANDS,
  NetworkId,
  PaymentOrderColumn,
  USDT_TRON,
  USDT_ETHEREUM,
  ASSET_NETWORK_REGISTRY,
  getAssetNetworkConfig,
  findAssetNetworkRow,
  WebhookEventType,
  ServiceBillStatus,
  ServiceBillUpdateAction,
  AuditAction,
  AuditLogColumn,
  ApiSigningHeader,
  API_SIGNING_MAX_SKEW_SECONDS,
  RateLimitPerMinute,
  WEBHOOK_RETRY_DELAYS_SECONDS,
  API_KEY_MAX_PER_ORG,
  ApiKeyColumn,
  SiteOverrideKind,
  SettingsSource,
  DEFAULT_ORDER_DELETE_DAYS,
} from "../dist/index.js";

describe("@cryptogate/domain", () => {
  it("exports org types used by Business-Model", () => {
    assert.equal(OrgType.Platform, "platform");
    assert.equal(OrgType.MerchantSite, "merchant_site");
  });

  it("restricts cashier naming to role enum", () => {
    assert.equal(UserRole.Cashier, "cashier");
  });

  it("exports membership lifecycle statuses", () => {
    assert.equal(MembershipStatus.Active, "active");
    assert.equal(MembershipStatus.Paused, "paused");
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
    assert.equal(DEFAULT_ASSET_NETWORK.contractAddress, USDT_TRON.contractAddress);
  });

  it("seeds Small/Mid/Enterprise fee bands from Business-Model", () => {
    assert.equal(DEFAULT_FEE_TIER_BANDS.length, 3);
    assert.equal(DEFAULT_FEE_TIER_BANDS[0].tier, MerchantTier.Small);
    assert.equal(DEFAULT_FEE_TIER_BANDS[0].defaultSignupPercent, "2.0");
    assert.equal(AuditAction.FeeTierPut, "fee_tier_put");
    assert.equal(AuditAction.EnterpriseRateDecide, "enterprise_rate_decide");
    assert.equal(AuditAction.ComplianceOverride, "compliance_override");
    assert.equal(AuditAction.SiteOverrideRequest, "site_override_request");
    assert.equal(AuditAction.SiteOverrideDecide, "site_override_decide");
    assert.equal(AuditAction.ProfileUpdate, "profile_update");
  });

  it("registers full Phase 1 §VI catalog; only USDT Tron is live", () => {
    const row = getAssetNetworkConfig(AssetCode.USDT, NetworkId.Tron);
    assert.ok(row);
    assert.equal(row.displayNetwork, "TRON TRC-20");
    assert.equal(row.decimals, 6);
    assert.equal(row.requiredConfirmations, 19);
    assert.equal(row.memoSupported, false);
    assert.equal(row.minAmount, "0.01");
    assert.equal(
      getAssetNetworkConfig(AssetCode.USDT, NetworkId.Ethereum),
      undefined,
    );
    assert.equal(ASSET_NETWORK_REGISTRY.length, 15);
    assert.equal(ASSET_NETWORK_REGISTRY[0], USDT_TRON);
    assert.equal(ASSET_NETWORK_REGISTRY[1], USDT_ETHEREUM);
    assert.equal(USDT_ETHEREUM.enabled, false);
    assert.equal(USDT_ETHEREUM.requiredConfirmations, 12);
    assert.equal(USDT_ETHEREUM.displayNetwork, "Ethereum ERC-20");
    assert.equal(
      ASSET_NETWORK_REGISTRY.filter((r) => r.enabled).length,
      1,
    );
    assert.equal(
      findAssetNetworkRow(AssetCode.USDT, NetworkId.Ethereum),
      USDT_ETHEREUM,
    );
    assert.equal(
      findAssetNetworkRow(AssetCode.BTC, NetworkId.Bitcoin)?.contractAddress,
      null,
    );
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

  it("exports M3 webhook, service-bill, and signing constants", () => {
    assert.equal(WebhookEventType.PaymentOrderCompleted, "payment_order.completed");
    assert.equal(WebhookEventType.WebhookTest, "webhook.test");
    assert.equal(ServiceBillStatus.Issued, "issued");
    assert.equal(ServiceBillUpdateAction.MarkPaid, "mark_paid");
    assert.equal(AuditAction.ServiceBillIssue, "service_bill_issue");
    assert.equal(AuditAction.ServiceBillAdjust, "service_bill_adjust");
    assert.equal(AuditLogColumn.action, "action");
    assert.equal(ApiSigningHeader.Signature, "X-Signature");
    assert.equal(API_SIGNING_MAX_SKEW_SECONDS, 300);
    assert.equal(RateLimitPerMinute.apiKey, 120);
    assert.deepEqual([...WEBHOOK_RETRY_DELAYS_SECONDS], [1, 5, 25, 125, 625]);
    assert.equal(API_KEY_MAX_PER_ORG, 10);
    assert.equal(ApiKeyColumn.keyId, "key_id");
    assert.equal(ApiKeyColumn.secret, "secret");
    assert.equal(SiteOverrideKind.MatchingMode, "matching_mode");
    assert.equal(SettingsSource.Inherit, "inherit");
    assert.equal(DEFAULT_ORDER_DELETE_DAYS, 90);
  });
});
