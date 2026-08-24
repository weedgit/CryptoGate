/**
 * Shared Phase 1 domain types. No business logic.
 * Enum string values must match OpenAPI and DB enums exactly.
 */

/** Org account type — node in the platform tree. */
export const OrgType = {
  Platform: "platform",
  Agent: "agent",
  AgentSub: "agent_sub",
  Merchant: "merchant",
  MerchantSite: "merchant_site",
} as const;

export type OrgType = (typeof OrgType)[keyof typeof OrgType];

/**
 * User role inside one org account.
 * Cashier is only valid on merchant / merchant_site.
 */
export const UserRole = {
  Owner: "owner",
  Administrator: "administrator",
  Viewer: "viewer",
  Cashier: "cashier",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/** Payment order lifecycle (Phase1-Project-Plan §V M3). */
export const OrderStatus = {
  PendingPayment: "pending_payment",
  Verifying: "verifying",
  Confirmed: "confirmed",
  Completed: "completed",
  Expired: "expired",
  PaymentAnomaly: "payment_anomaly",
  Failed: "failed",
  Cancelled: "cancelled",
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/** Merchant-selectable matching modes (Phase 1). Mode A is Phase 2. */
export const MatchingMode = {
  /** Standard — fixed address + strict match */
  B: "B",
  /** Amount fingerprint */
  C: "C",
  /** Memo / destination tag (network-limited) */
  D: "D",
  /** Smart address — main unless conflict, then HD pool */
  S: "S",
} as const;

export type MatchingMode = (typeof MatchingMode)[keyof typeof MatchingMode];

/** Where the receive address came from (Mode S). */
export const AddressSource = {
  Main: "main",
  HdPool: "hd_pool",
} as const;

export type AddressSource = (typeof AddressSource)[keyof typeof AddressSource];

/** HD pool slot state (Mode S). */
export const HdPoolState = {
  Free: "FREE",
  InUse: "IN_USE",
  Cooldown: "COOLDOWN",
} as const;

export type HdPoolState = (typeof HdPoolState)[keyof typeof HdPoolState];

/** Virtual asset codes (Phase1-Project-Plan §VI subset for Phase 1 start). */
export const AssetCode = {
  USDT: "USDT",
  USDC: "USDC",
  BTC: "BTC",
  ETH: "ETH",
  TRX: "TRX",
} as const;

export type AssetCode = (typeof AssetCode)[keyof typeof AssetCode];

/** Merchant size tier for platform fee bands (Business-Model.md). */
export const MerchantTier = {
  Small: "small",
  Mid: "mid",
  Enterprise: "enterprise",
} as const;

export type MerchantTier = (typeof MerchantTier)[keyof typeof MerchantTier];

/** One Small/Mid/Enterprise band row (platform settings B8). */
export type FeeTierBand = {
  tier: MerchantTier;
  subscriptionAmountUsd: string;
  volumeFeeMinPercent: string;
  volumeFeeMaxPercent: string;
  defaultSignupPercent: string;
  tierDescription?: string;
};

/** Phase 1 seed values — Platform Owner may change via PUT /platform/settings/fee-tiers. */
export const DEFAULT_FEE_TIER_BANDS: readonly FeeTierBand[] = [
  {
    tier: MerchantTier.Small,
    subscriptionAmountUsd: "49.00",
    volumeFeeMinPercent: "1.2",
    volumeFeeMaxPercent: "2.0",
    defaultSignupPercent: "2.0",
  },
  {
    tier: MerchantTier.Mid,
    subscriptionAmountUsd: "199.00",
    volumeFeeMinPercent: "0.8",
    volumeFeeMaxPercent: "1.5",
    defaultSignupPercent: "1.2",
  },
  {
    tier: MerchantTier.Enterprise,
    subscriptionAmountUsd: "0.00",
    volumeFeeMinPercent: "0.5",
    volumeFeeMaxPercent: "1.0",
    defaultSignupPercent: "0.8",
  },
] as const;

/** Network identifiers used in API and config. */
export const NetworkId = {
  Ethereum: "ethereum",
  Tron: "tron",
  BnbSmartChain: "bnb_smart_chain",
  Polygon: "polygon",
  ArbitrumOne: "arbitrum_one",
  Solana: "solana",
  Ton: "ton",
  Base: "base",
  Bitcoin: "bitcoin",
} as const;

export type NetworkId = (typeof NetworkId)[keyof typeof NetworkId];

/** Asset + network pair (e.g. USDT on Tron). */
export type AssetNetwork = {
  asset: AssetCode;
  network: NetworkId;
  /** Token contract when applicable; omit for native assets. */
  contractAddress?: string;
};

/**
 * Per asset+network catalog. Confirmations, decimals, and Mode D support
 * come from here — not magic numbers in API, watcher, or payment-page.
 *
 * Phase 1 enabled pair: USDT on Tron. Other AssetCode/NetworkId values stay
 * in enums for later milestones; lookup returns undefined until enabled here.
 */
export type AssetNetworkConfig = {
  asset: AssetCode;
  network: NetworkId;
  enabled: boolean;
  /** Guest/cashier label, e.g. TRON TRC-20 */
  displayNetwork: string;
  /** Token contract; null for native assets */
  contractAddress: string | null;
  decimals: number;
  /** Major-unit decimal string */
  minAmount: string;
  /** Mode C fingerprint step in major units */
  amountStep: string;
  requiredConfirmations: number;
  /** False for typical USDT account tokens (Phase1-Project-Plan §2.4) */
  memoSupported: boolean;
};

/** First live M3 target: USDT TRC-20. */
export const USDT_TRON: AssetNetworkConfig = {
  asset: AssetCode.USDT,
  network: NetworkId.Tron,
  enabled: true,
  displayNetwork: "TRON TRC-20",
  contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  decimals: 6,
  minAmount: "0.01",
  amountStep: "0.01",
  requiredConfirmations: 19,
  memoSupported: false,
};

/**
 * M3-32 next pair (Phase1-Project-Plan §VI). Registry row exists for Bruce chain
 * client work; create-order stays 422 until Kevin sets `enabled: true`.
 */
export const USDT_ETHEREUM: AssetNetworkConfig = {
  asset: AssetCode.USDT,
  network: NetworkId.Ethereum,
  enabled: false,
  displayNetwork: "Ethereum ERC-20",
  contractAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  decimals: 6,
  minAmount: "0.01",
  amountStep: "0.01",
  requiredConfirmations: 12,
  memoSupported: false,
};

export const ASSET_NETWORK_REGISTRY: readonly AssetNetworkConfig[] = [
  USDT_TRON,
  USDT_ETHEREUM,
];

export function getAssetNetworkConfig(
  asset: AssetCode,
  network: NetworkId,
): AssetNetworkConfig | undefined {
  return ASSET_NETWORK_REGISTRY.find(
    (row) => row.enabled && row.asset === asset && row.network === network,
  );
}

export function toAssetNetwork(row: AssetNetworkConfig): AssetNetwork {
  return {
    asset: row.asset,
    network: row.network,
    ...(row.contractAddress ? { contractAddress: row.contractAddress } : {}),
  };
}

/** First Sprint 0 / M3 target pair. */
export const DEFAULT_ASSET_NETWORK: AssetNetwork = toAssetNetwork(USDT_TRON);

/**
 * Money amount as a decimal string in major units (avoid float).
 * Example: "50.01" USDT.
 */
export type Money = {
  amount: string;
  currency: AssetCode;
};

/**
 * DB column names on `payment_orders` (Andrew migration; watcher reads).
 * TypeScript and OpenAPI use camelCase; persist these snake_case names.
 */
export const PaymentOrderColumn = {
  matchingMode: "matching_mode",
  payableAmount: "payable_amount",
  receiveAddress: "receive_address",
  addressSource: "address_source",
  hdIndex: "hd_index",
  memoOrTag: "memo_or_tag",
} as const;

export type PaymentOrderColumnName =
  (typeof PaymentOrderColumn)[keyof typeof PaymentOrderColumn];

/**
 * Fields written at create from `packages/matching` `assignOnCreate`.
 * Mode is stored on the order here; changing merchant default must not rewrite open orders.
 */
export type PaymentOrderAssignFields = {
  matchingMode: MatchingMode;
  payableAmount: Money;
  receiveAddress: string;
  addressSource: AddressSource;
  hdIndex: number | null;
  memoOrTag: string | null;
};

/**
 * Shared payment-order shape (API camelCase).
 * Receive address is merchant-controlled; platform has no spend keys.
 */
export type PaymentOrder = PaymentOrderAssignFields & {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  receivedAmount: Money | null;
  asset: AssetCode;
  network: NetworkId;
  /** ISO-8601 timestamp */
  expiresAt: string;
  createdBy?: string;
};

/** Outbound merchant webhook names (OpenAPI WebhookEventType). */
export const WebhookEventType = {
  PaymentOrderCreated: "payment_order.created",
  PaymentOrderVerifying: "payment_order.verifying",
  PaymentOrderCompleted: "payment_order.completed",
  PaymentOrderExpired: "payment_order.expired",
  PaymentOrderPaymentAnomaly: "payment_order.payment_anomaly",
  PaymentOrderFailed: "payment_order.failed",
  WebhookTest: "webhook.test",
} as const;

export type WebhookEventType =
  (typeof WebhookEventType)[keyof typeof WebhookEventType];

export const WebhookDeliveryStatus = {
  Pending: "pending",
  Success: "success",
  Failed: "failed",
} as const;

export type WebhookDeliveryStatus =
  (typeof WebhookDeliveryStatus)[keyof typeof WebhookDeliveryStatus];

/**
 * Service bill lifecycle. Separate rail from OrderStatus — never reuse
 * payment-order states for platform billing.
 */
export const ServiceBillStatus = {
  Issued: "issued",
  Paid: "paid",
  Overdue: "overdue",
  Voided: "voided",
} as const;

export type ServiceBillStatus =
  (typeof ServiceBillStatus)[keyof typeof ServiceBillStatus];

/** Phase 1 service bills are invoiced in USD (not skimmed from on-chain USDT). */
export const BillingCurrency = {
  USD: "USD",
} as const;

export type BillingCurrency =
  (typeof BillingCurrency)[keyof typeof BillingCurrency];

/** DB columns on `service_bills` (Andrew migration). */
export const ServiceBillColumn = {
  orgId: "org_id",
  periodStart: "period_start",
  periodEnd: "period_end",
  subscriptionAmount: "subscription_amount",
  volumeFeeAmount: "volume_fee_amount",
  totalAmount: "total_amount",
  currency: "currency",
  status: "status",
  dueAt: "due_at",
} as const;

export type ServiceBillColumnName =
  (typeof ServiceBillColumn)[keyof typeof ServiceBillColumn];

/**
 * Platform SaaS invoice (subscription + volume fee). Funds go to the
 * platform billing wallet — never deducted from the payer's on-chain payment.
 */
export type ServiceBill = {
  id: string;
  orgId: string;
  periodStart: string;
  periodEnd: string;
  subscriptionAmount: string;
  volumeFeeAmount: string;
  totalAmount: string;
  currency: BillingCurrency;
  status: ServiceBillStatus;
  dueAt: string;
  /** Set when status becomes paid (v0.3.2). */
  paidAt?: string | null;
  /** Set when status becomes voided (v0.3.2). */
  voidedAt?: string | null;
  /** Last platform adjustment note (v0.3.2). */
  lastAdjustmentReason?: string | null;
};

/** Platform-only service bill lifecycle updates (v0.3.2). */
export const ServiceBillUpdateAction = {
  MarkPaid: "mark_paid",
  Void: "void",
  Adjust: "adjust",
} as const;

export type ServiceBillUpdateAction =
  (typeof ServiceBillUpdateAction)[keyof typeof ServiceBillUpdateAction];

/**
 * Append-only audit actions (M1-17). Values match `audit_log.action` and
 * apps/api audit-rules where implemented.
 */
export const AuditAction = {
  Login: "login",
  Logout: "logout",
  MfaEnroll: "mfa_enroll",
  MfaVerifyEnroll: "mfa_verify_enroll",
  MfaVerifyLogin: "mfa_verify_login",
  OrgCreate: "org_create",
  OrgUserInvite: "org_user_invite",
  OrgUserRole: "org_user_role",
  SettlementPut: "settlement_put",
  MatchingModePut: "matching_mode_put",
  XpubPut: "xpub_put",
  WebhookRegister: "webhook_register",
  WebhookDelete: "webhook_delete",
  ServiceBillIssue: "service_bill_issue",
  ServiceBillMarkPaid: "service_bill_mark_paid",
  ServiceBillVoid: "service_bill_void",
  ServiceBillAdjust: "service_bill_adjust",
  ApiKeyCreate: "api_key_create",
  ApiKeyRevoke: "api_key_revoke",
  ApiKeyRotate: "api_key_rotate",
  FeeTierPut: "fee_tier_put",
  OrgPolicyPut: "org_policy_put",
  MerchantCommercialPut: "merchant_commercial_put",
  EnterpriseRateDecide: "enterprise_rate_decide",
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/** DB columns on `audit_log`. */
export const AuditLogColumn = {
  actorUserId: "actor_user_id",
  orgId: "org_id",
  action: "action",
  metadata: "metadata",
  createdAt: "created_at",
} as const;

export type AuditLogColumnName =
  (typeof AuditLogColumn)[keyof typeof AuditLogColumn];

/** Redacted audit row for GET /audit (v0.3.2). Never includes secrets in metadata. */
export type AuditLogEntry = {
  id: string;
  actorUserId: string | null;
  orgId: string | null;
  action: AuditAction | string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
};

/**
 * Machine API key metadata (M4-11). Never include `secret` on list/GET.
 * `keyId` is the public X-Api-Key value; HMAC uses the one-time `secret`.
 */
export type ApiKey = {
  id: string;
  orgId: string;
  keyId: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

/** Soft cap on active (non-revoked) keys per merchant org. */
export const API_KEY_MAX_PER_ORG = 10;

/** DB columns on `api_keys` (Andrew migration — extend 012 for label/last_used/expires). */
export const ApiKeyColumn = {
  orgId: "org_id",
  userId: "user_id",
  keyId: "key_id",
  secret: "secret",
  label: "label",
  lastUsedAt: "last_used_at",
  expiresAt: "expires_at",
  revokedAt: "revoked_at",
  createdAt: "created_at",
} as const;

export type ApiKeyColumnName = (typeof ApiKeyColumn)[keyof typeof ApiKeyColumn];

/** Machine-client signing headers (required with X-Api-Key; omit on session). */
export const ApiSigningHeader = {
  ApiKey: "X-Api-Key",
  Timestamp: "X-Timestamp",
  Nonce: "X-Nonce",
  Signature: "X-Signature",
} as const;

/** |now - X-Timestamp| greater than this → 401 timestamp_skew. */
export const API_SIGNING_MAX_SKEW_SECONDS = 300;

/** Nonce uniqueness window per API key (must be ≥ 2× skew). */
export const API_SIGNING_NONCE_TTL_SECONDS = 600;

/** Phase 1 rate limits (M3-11). 429 + Retry-After when exceeded. */
export const RateLimitPerMinute = {
  apiKey: 120,
  ip: 300,
  login: 10,
  guestPayment: 60,
} as const;

/** Delivery worker backoff after non-2xx or timeout (M3-14). */
export const WEBHOOK_RETRY_DELAYS_SECONDS = [1, 5, 25, 125, 625] as const;

export const WEBHOOK_HTTP_TIMEOUT_MS = 10_000;
