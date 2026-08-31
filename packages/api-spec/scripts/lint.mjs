import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const specPath = join(root, "..", "openapi.yaml");
const raw = readFileSync(specPath, "utf8");

const required = [
  "openapi: 3.0.3",
  "version: 0.3.5",
  "/auth/login",
  "/auth/logout",
  "/auth/session",
  "mfa_required",
  "/auth/mfa/enroll",
  "/auth/mfa/verify",
  "/orgs",
  "/orgs/{orgId}/matching-mode",
  "getMatchingModeSettings",
  "putMatchingModeSettings",
  "MatchingModeSettings",
  "UpdateMatchingModeRequest",
  "/orgs/{orgId}/settlement",
  "listSettlementAddresses",
  "putSettlementAddress",
  "SettlementAddress",
  "SettlementAddressList",
  "UpsertSettlementAddressRequest",
  "pendingAddress",
  "pendingActivatesAt",
  "mfaCode",
  "/orgs/{orgId}/xpub",
  "listXpubSettings",
  "putXpubSettings",
  "XpubSettings",
  "XpubSettingsList",
  "UpsertXpubRequest",
  "xPubConfigured",
  "pendingXPub",
  "/orgs/{orgId}/hd-pool",
  "listHdPoolAddresses",
  "HdPoolState",
  "HdPoolAddress",
  "HdPoolList",
  "derivationPath",
  "/orgs/{orgId}/setting-overrides",
  "listSiteSettingOverrides",
  "requestSiteSettingOverride",
  "decideSiteSettingOverride",
  "SiteSettingOverride",
  "override_required",
  "/orgs/{orgId}/retention",
  "getOrgRetentionSettings",
  "putOrgRetentionSettings",
  "orderDeleteDays",
  "SettingsSource",
  "site_override_request",
  "site_override_decide",
  "PaymentOrderList",
  "format=csv",
  "/orders/{id}/payment",
  "/orders/{id}/on-chain",
  "getPaymentOrderOnChain",
  "createPaymentOrder",
  "getPaymentOrder",
  "getPaymentOrderPayment",
  "resolvePaymentAnomaly",
  "/orders/{id}/resolve-anomaly",
  "OrgType",
  "UserRole",
  "OrderStatus",
  "MatchingMode",
  "addressSource",
  "hdIndex",
  "memoOrTag",
  "copyAmount",
  "merchantName",
  "payExactAmountWarning",
  "Idempotency-Key",
  "X-Timestamp",
  "X-Nonce",
  "X-Signature",
  "nonce_replay",
  "timestamp_skew",
  "signature_invalid",
  "rate_limited",
  "/api-keys",
  "listApiKeys",
  "createApiKey",
  "revokeApiKey",
  "rotateApiKey",
  "ApiKey",
  "ApiKeyCreated",
  "ApiKeyList",
  "CreateApiKeyRequest",
  "ApiKeyScope",
  "ipAllowlist",
  "listWebhooks",
  "registerWebhook",
  "testWebhook",
  "deleteWebhook",
  "rotateWebhookSecret",
  "listWebhookDeliveries",
  "resendWebhookDelivery",
  "WebhookEventType",
  "WebhookEndpoint",
  "WebhookCreated",
  "signingSecret",
  "getNotificationPreferences",
  "putNotificationPreferences",
  "NotificationPreference",
  "NotificationPreferenceList",
  "/notification-preferences",
  "/commission-payouts",
  "listCommissionPayouts",
  "upsertCommissionPayout",
  "generateCommissionInvoices",
  "confirmCommissionPayoutSent",
  "agentConfirmCommissionPayout",
  "markCommissionPayoutPaid",
  "CommissionPayout",
  "/agent-commissions",
  "listAgentCommissions",
  "/agent-payout-addresses",
  "listAgentPayoutAddresses",
  "underpayTolerance",
  "listServiceBills",
  "issueServiceBill",
  "generateServiceBills",
  "/service-bills/generate",
  "getServiceBill",
  "getServiceBillCheckout",
  "updateServiceBill",
  "UpdateServiceBillRequest",
  "/audit",
  "listAuditLog",
  "AuditLogEntry",
  "AuditLogList",
  "AuditAction",
  "MerchantTier",
  "FeeTierBand",
  "PlatformFeeTierSettings",
  "/platform/settings/fee-tiers",
  "getFeeTierSettings",
  "updateFeeTierSettings",
  "/platform/settings/org-policy",
  "getPlatformOrgPolicy",
  "updatePlatformOrgPolicy",
  "listOrgUsers",
  "OrgMember",
  "/orgs/{orgId}/commercial",
  "getMerchantCommercial",
  "updateMerchantCommercial",
  "/platform/enterprise-rate-approvals",
  "listEnterpriseRateApprovals",
  "/platform/watcher-health",
  "getWatcherHealth",
  "WatcherHealthList",
  "WatcherHeartbeat",
  "forgotPassword",
  "resetPassword",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/platform/orgs/{orgId}/compliance-override",
  "applyComplianceOverride",
  "listComplianceOverrides",
  "ComplianceOverride",
  "compliance_override",
  "listOrgMemberEmails",
  "listPlatformOrgMemberEmails",
  "listPlatformOrgEmails",
  "getOrgOverview",
  "decideEnterpriseRateApproval",
  "fee_tier_put",
  "merchant_commercial_put",
  "enterprise_rate_decide",
  "ServiceBillStatus",
  "ServiceBillCheckout",
  "security: []",
];

const missing = required.filter((needle) => !raw.includes(needle));
if (missing.length > 0) {
  console.error("OpenAPI M3 contract freeze checks failed. Missing:");
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}

if (raw.includes("xPubConfigured") === false) {
  console.error("GET xPub must expose presence (xPubConfigured), not the key");
  process.exit(1);
}

const hdSlice = raw.split("/orgs/{orgId}/hd-pool:")[1]?.split("/orders:")[0] ?? "";
if (hdSlice.includes("xPub") && /properties:[\s\S]*xPub:/.test(hdSlice)) {
  console.error("GET hd-pool must not expose xPub property");
  process.exit(1);
}

const paymentSlice =
  raw.split("/orders/{id}/payment:")[1]?.split("/api-keys:")[0] ?? "";
if (paymentSlice.includes("sessionCookie") || paymentSlice.includes("apiKey")) {
  console.error("GET /orders/{id}/payment must not require a merchant session");
  process.exit(1);
}
if (!paymentSlice.includes("security: []")) {
  console.error("GET /orders/{id}/payment must set security: []");
  process.exit(1);
}

const apiKeyListSchema =
  raw.split("    ApiKey:")[1]?.split("    ApiKeyList:")[0] ?? "";
if (/^\s+secret:/m.test(apiKeyListSchema)) {
  console.error("ApiKey GET schema must not include secret");
  process.exit(1);
}

const endpointSchema =
  raw.split("    WebhookEndpoint:")[1]?.split("    WebhookEndpointList:")[0] ?? "";
if (/^\s+signingSecret:/m.test(endpointSchema)) {
  console.error("WebhookEndpoint GET schema must not include signingSecret");
  process.exit(1);
}

const billsSlice = raw.split("/service-bills:")[1]?.split("\ncomponents:")[0] ?? "";
if (
  billsSlice.includes("createPaymentOrder") ||
  billsSlice.includes("#/components/schemas/PaymentDetails") ||
  billsSlice.includes("#/components/schemas/PaymentOrder")
) {
  console.error("service-bills rail must not reuse payment-order operations");
  process.exit(1);
}

console.log("OpenAPI contract freeze v0.3.5: ok");
