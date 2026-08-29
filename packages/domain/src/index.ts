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

/**
 * Membership lifecycle inside one org account.
 * Paused members keep the row but lose org access until resumed.
 * Removed members are deleted from org_memberships (not from users).
 */
export const MembershipStatus = {
  Active: "active",
  Paused: "paused",
} as const;

export type MembershipStatus =
  (typeof MembershipStatus)[keyof typeof MembershipStatus];

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
  /** Local/staging only — filtered out when CRYPTOGATE_CHAIN_ENV=mainnet */
  TronNile: "tron_nile",
  BnbSmartChain: "bnb_smart_chain",
  Polygon: "polygon",
  ArbitrumOne: "arbitrum_one",
  Solana: "solana",
  Ton: "ton",
  Base: "base",
  Bitcoin: "bitcoin",
} as const;

export type NetworkId = (typeof NetworkId)[keyof typeof NetworkId];

/**
 * Deployment chain surface. Production must stay `mainnet` so testnet pairs
 * never appear in API or portal UI.
 */
export const ChainEnvironment = {
  Mainnet: "mainnet",
  Testnet: "testnet",
} as const;

export type ChainEnvironment =
  (typeof ChainEnvironment)[keyof typeof ChainEnvironment];

function readChainEnvRaw(): string {
  const g = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  const fromProcess =
    g.process?.env?.CRYPTOGATE_CHAIN_ENV ??
    g.process?.env?.VITE_CRYPTOGATE_CHAIN_ENV;
  if (fromProcess) return fromProcess.trim().toLowerCase();
  try {
    const meta = import.meta as { env?: Record<string, string | undefined> };
    const fromVite = meta.env?.VITE_CRYPTOGATE_CHAIN_ENV;
    if (fromVite) return fromVite.trim().toLowerCase();
  } catch {
    /* non-module / non-vite runtime */
  }
  return "";
}

/**
 * Active chain environment. Default `mainnet` (product / production).
 * Set `CRYPTOGATE_CHAIN_ENV=testnet` (API/watcher) or
 * `VITE_CRYPTOGATE_CHAIN_ENV=testnet` (web) for local Nile testing only.
 */
export function resolveChainEnvironment(
  override?: string | null,
): ChainEnvironment {
  const raw = (override ?? readChainEnvRaw()).trim().toLowerCase();
  if (raw === ChainEnvironment.Testnet || raw === "dev" || raw === "development") {
    return ChainEnvironment.Testnet;
  }
  return ChainEnvironment.Mainnet;
}

export function isTestnetEnvironment(env?: string | null): boolean {
  return resolveChainEnvironment(env) === ChainEnvironment.Testnet;
}

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
 * Phase 1 access list: Phase1-Project-Plan §VI / M3-04. Only rows with
 * `enabled: true` accept create-order; others are catalogued for staged go-live.
 * Rows with `chainEnv: testnet` are visible only when resolveChainEnvironment()
 * is testnet — never in production product builds.
 */
export type AssetNetworkConfig = {
  asset: AssetCode;
  network: NetworkId;
  enabled: boolean;
  /** mainnet = product; testnet = local/staging only */
  chainEnv: ChainEnvironment;
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

/** Live Phase 1 pair: USDT TRC-20 (mainnet). */
export const USDT_TRON: AssetNetworkConfig = {
  asset: AssetCode.USDT,
  network: NetworkId.Tron,
  enabled: true,
  chainEnv: ChainEnvironment.Mainnet,
  displayNetwork: "TRON TRC-20",
  contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  decimals: 6,
  minAmount: "0.01",
  amountStep: "0.01",
  requiredConfirmations: 19,
  memoSupported: false,
};

/**
 * Local/staging only — USDT on Tron Nile testnet.
 * Visible when CRYPTOGATE_CHAIN_ENV=testnet (alongside mainnet pairs);
 * never when env is mainnet (product / production).
 * Contract: official Nile USDT (override with TRON_USDT_CONTRACT if needed).
 */
export const USDT_TRON_NILE: AssetNetworkConfig = {
  asset: AssetCode.USDT,
  network: NetworkId.TronNile,
  enabled: true,
  chainEnv: ChainEnvironment.Testnet,
  displayNetwork: "TRON Nile (testnet)",
  contractAddress: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
  decimals: 6,
  minAmount: "0.01",
  amountStep: "0.01",
  requiredConfirmations: 19,
  memoSupported: false,
};

/**
 * Live (M3-32). Chain client + watcher ingest when ETH_RPC_URL is set.
 */
export const USDT_ETHEREUM: AssetNetworkConfig = {
  asset: AssetCode.USDT,
  network: NetworkId.Ethereum,
  enabled: true,
  chainEnv: ChainEnvironment.Mainnet,
  displayNetwork: "Ethereum ERC-20",
  contractAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  decimals: 6,
  minAmount: "0.01",
  amountStep: "0.01",
  requiredConfirmations: 12,
  memoSupported: false,
};

export const USDT_BNB_SMART_CHAIN: AssetNetworkConfig = {
  asset: AssetCode.USDT,
  network: NetworkId.BnbSmartChain,
  enabled: true,
  chainEnv: ChainEnvironment.Mainnet,
  displayNetwork: "BNB Smart Chain BEP-20",
  contractAddress: "0x55d398326f99059fF775485246999027B3197955",
  decimals: 18,
  minAmount: "0.01",
  amountStep: "0.01",
  requiredConfirmations: 15,
  memoSupported: false,
};

export const USDT_POLYGON: AssetNetworkConfig = {
  asset: AssetCode.USDT,
  network: NetworkId.Polygon,
  enabled: true,
  chainEnv: ChainEnvironment.Mainnet,
  displayNetwork: "Polygon PoS",
  contractAddress: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  decimals: 6,
  minAmount: "0.01",
  amountStep: "0.01",
  requiredConfirmations: 64,
  memoSupported: false,
};

export const USDT_ARBITRUM_ONE: AssetNetworkConfig = {
  asset: AssetCode.USDT,
  network: NetworkId.ArbitrumOne,
  enabled: true,
  chainEnv: ChainEnvironment.Mainnet,
  displayNetwork: "Arbitrum One",
  contractAddress: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  decimals: 6,
  minAmount: "0.01",
  amountStep: "0.01",
  requiredConfirmations: 12,
  memoSupported: false,
};

export const USDT_SOLANA: AssetNetworkConfig = {
  asset: AssetCode.USDT,
  network: NetworkId.Solana,
  enabled: true,
  chainEnv: ChainEnvironment.Mainnet,
  displayNetwork: "Solana",
  contractAddress: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  decimals: 6,
  minAmount: "0.01",
  amountStep: "0.01",
  requiredConfirmations: 32,
  memoSupported: false,
};

export const USDT_TON: AssetNetworkConfig = {
  asset: AssetCode.USDT,
  network: NetworkId.Ton,
  enabled: true,
  chainEnv: ChainEnvironment.Mainnet,
  displayNetwork: "TON",
  contractAddress: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
  decimals: 6,
  minAmount: "0.01",
  amountStep: "0.01",
  requiredConfirmations: 5,
  memoSupported: false,
};

export const USDC_ETHEREUM: AssetNetworkConfig = {
  asset: AssetCode.USDC,
  network: NetworkId.Ethereum,
  enabled: true,
  chainEnv: ChainEnvironment.Mainnet,
  displayNetwork: "Ethereum ERC-20",
  contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  decimals: 6,
  minAmount: "0.01",
  amountStep: "0.01",
  requiredConfirmations: 12,
  memoSupported: false,
};

export const USDC_POLYGON: AssetNetworkConfig = {
  asset: AssetCode.USDC,
  network: NetworkId.Polygon,
  enabled: true,
  chainEnv: ChainEnvironment.Mainnet,
  displayNetwork: "Polygon PoS",
  contractAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  decimals: 6,
  minAmount: "0.01",
  amountStep: "0.01",
  requiredConfirmations: 64,
  memoSupported: false,
};

export const USDC_ARBITRUM_ONE: AssetNetworkConfig = {
  asset: AssetCode.USDC,
  network: NetworkId.ArbitrumOne,
  enabled: true,
  chainEnv: ChainEnvironment.Mainnet,
  displayNetwork: "Arbitrum One",
  contractAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  decimals: 6,
  minAmount: "0.01",
  amountStep: "0.01",
  requiredConfirmations: 12,
  memoSupported: false,
};

export const USDC_BASE: AssetNetworkConfig = {
  asset: AssetCode.USDC,
  network: NetworkId.Base,
  enabled: true,
  chainEnv: ChainEnvironment.Mainnet,
  displayNetwork: "Base",
  contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  decimals: 6,
  minAmount: "0.01",
  amountStep: "0.01",
  requiredConfirmations: 12,
  memoSupported: false,
};

export const USDC_SOLANA: AssetNetworkConfig = {
  asset: AssetCode.USDC,
  network: NetworkId.Solana,
  enabled: true,
  chainEnv: ChainEnvironment.Mainnet,
  displayNetwork: "Solana",
  contractAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  decimals: 6,
  minAmount: "0.01",
  amountStep: "0.01",
  requiredConfirmations: 32,
  memoSupported: false,
};

export const BTC_BITCOIN: AssetNetworkConfig = {
  asset: AssetCode.BTC,
  network: NetworkId.Bitcoin,
  enabled: true,
  chainEnv: ChainEnvironment.Mainnet,
  displayNetwork: "Bitcoin",
  contractAddress: null,
  decimals: 8,
  minAmount: "0.0001",
  amountStep: "0.0001",
  requiredConfirmations: 3,
  memoSupported: false,
};

export const ETH_ETHEREUM: AssetNetworkConfig = {
  asset: AssetCode.ETH,
  network: NetworkId.Ethereum,
  enabled: true,
  chainEnv: ChainEnvironment.Mainnet,
  displayNetwork: "Ethereum",
  contractAddress: null,
  decimals: 18,
  minAmount: "0.001",
  amountStep: "0.001",
  requiredConfirmations: 12,
  memoSupported: false,
};

/** Native TRX — not interchangeable with USDT TRC-20. */
export const TRX_TRON: AssetNetworkConfig = {
  asset: AssetCode.TRX,
  network: NetworkId.Tron,
  enabled: true,
  chainEnv: ChainEnvironment.Mainnet,
  displayNetwork: "Tron (native)",
  contractAddress: null,
  decimals: 6,
  minAmount: "1",
  amountStep: "1",
  requiredConfirmations: 19,
  memoSupported: false,
};

/**
 * Full Phase 1 §VI catalog plus thin local testnet rows.
 * Prefer `listAssetNetworkRegistry()` / `getAssetNetworkConfig()` so testnet
 * rows are hidden when chain env is mainnet.
 */
export const ASSET_NETWORK_REGISTRY: readonly AssetNetworkConfig[] = [
  USDT_TRON,
  USDT_TRON_NILE,
  USDT_ETHEREUM,
  USDT_BNB_SMART_CHAIN,
  USDT_POLYGON,
  USDT_ARBITRUM_ONE,
  USDT_SOLANA,
  USDT_TON,
  USDC_ETHEREUM,
  USDC_POLYGON,
  USDC_ARBITRUM_ONE,
  USDC_BASE,
  USDC_SOLANA,
  BTC_BITCOIN,
  ETH_ETHEREUM,
  TRX_TRON,
];

/**
 * Catalog rows visible for the active (or overridden) chain environment.
 *
 * - `mainnet` → mainnet pairs only (product / production; Nile never appears)
 * - `testnet` → mainnet **and** testnet pairs (local/staging can exercise both)
 */
export function listAssetNetworkRegistry(
  env?: string | null,
): readonly AssetNetworkConfig[] {
  const active = resolveChainEnvironment(env);
  if (active === ChainEnvironment.Testnet) {
    return ASSET_NETWORK_REGISTRY.filter(
      (row) =>
        row.chainEnv === ChainEnvironment.Testnet ||
        row.chainEnv === ChainEnvironment.Mainnet,
    );
  }
  return ASSET_NETWORK_REGISTRY.filter(
    (row) => row.chainEnv === ChainEnvironment.Mainnet,
  );
}

/** Enabled pair only — used by create-order and matching. Env-gated. */
export function getAssetNetworkConfig(
  asset: AssetCode,
  network: NetworkId,
  env?: string | null,
): AssetNetworkConfig | undefined {
  return listAssetNetworkRegistry(env).find(
    (row) => row.enabled && row.asset === asset && row.network === network,
  );
}

/** Any catalog row for the active env (including disabled). */
export function findAssetNetworkRow(
  asset: AssetCode,
  network: NetworkId,
  env?: string | null,
): AssetNetworkConfig | undefined {
  return listAssetNetworkRegistry(env).find(
    (row) => row.asset === asset && row.network === network,
  );
}

/** True when network id is a Tron family chain (mainnet or Nile). */
export function isTronFamilyNetwork(network: string): boolean {
  return network === NetworkId.Tron || network === NetworkId.TronNile;
}

export function toAssetNetwork(row: AssetNetworkConfig): AssetNetwork {
  return {
    asset: row.asset,
    network: row.network,
    ...(row.contractAddress ? { contractAddress: row.contractAddress } : {}),
  };
}

/** First live Phase 1 pair. */
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
  anomalyReason: "anomaly_reason",
  anomalyResolutionNote: "anomaly_resolution_note",
  anomalyResolvedAt: "anomaly_resolved_at",
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
  /** ISO-8601 timestamp */
  createdAt?: string;
  createdBy?: string;
  /** Cashier / staff email when list/detail joins users */
  createdByEmail?: string | null;
  /** Merchant site or parent org display name */
  orgName?: string | null;
  /** Merchant PO / table / purpose reference (merchant_metadata.reference) */
  merchantReference?: string | null;
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
  tier: "tier",
  volumeFeePercent: "volume_fee_percent",
  billedVolumeUsd: "billed_volume_usd",
  paymentReference: "payment_reference",
  lastAdjustmentAmount: "last_adjustment_amount",
  createdAt: "created_at",
} as const;

export type ServiceBillColumnName =
  (typeof ServiceBillColumn)[keyof typeof ServiceBillColumn];

/**
 * Platform SaaS invoice (subscription + volume fee). Funds go to the
 * platform billing wallet — never deducted from the payer's on-chain payment.
 * Tier / rate / billed volume are frozen at issue (invoice snapshot).
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
  /** Fee tier at issue (`small` / `mid` / `enterprise`). */
  tier?: string | null;
  /** Effective volume fee % at issue. */
  volumeFeePercent?: string | null;
  /** Confirmed completed volume (USD) used for the volume fee line. */
  billedVolumeUsd?: string | null;
  /** Set when status becomes paid (v0.3.2). */
  paidAt?: string | null;
  /** Set when status becomes voided (v0.3.2). */
  voidedAt?: string | null;
  /** Last platform adjustment note (v0.3.2). */
  lastAdjustmentReason?: string | null;
  /** Last signed USD adjustment delta applied to total. */
  lastAdjustmentAmount?: string | null;
  /** Off-chain / remittance reference when marked paid. */
  paymentReference?: string | null;
  /** Issue timestamp. */
  createdAt?: string | null;
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
  OrgStatus: "org_status",
  OrgDelete: "org_delete",
  OrgUserInvite: "org_user_invite",
  OrgUserRole: "org_user_role",
  OrgUserPause: "org_user_pause",
  OrgUserResume: "org_user_resume",
  OrgUserRemove: "org_user_remove",
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
  BillingWalletPut: "billing_wallet_put",
  MerchantCommercialPut: "merchant_commercial_put",
  EnterpriseRateDecide: "enterprise_rate_decide",
  ComplianceOverride: "compliance_override",
  SiteOverrideRequest: "site_override_request",
  SiteOverrideDecide: "site_override_decide",
  ProfileUpdate: "profile_update",
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/** Merchant (site) setting kinds that inherit from the parent until Owner approval. */
export const SiteOverrideKind = {
  Settlement: "settlement",
  Xpub: "xpub",
  MatchingMode: "matching_mode",
  OrderRetention: "order_retention",
} as const;

export type SiteOverrideKind =
  (typeof SiteOverrideKind)[keyof typeof SiteOverrideKind];

export const SiteOverrideStatus = {
  Pending: "pending",
  Approved: "approved",
  Denied: "denied",
} as const;

export type SiteOverrideStatus =
  (typeof SiteOverrideStatus)[keyof typeof SiteOverrideStatus];

/** Where GET settlement / matching / xPub values were resolved from. */
export const SettingsSource = {
  Merchant: "merchant",
  Inherit: "inherit",
  Override: "override",
} as const;

export type SettingsSource =
  (typeof SettingsSource)[keyof typeof SettingsSource];

/** Default order-delete retention when unset (days). */
export const DEFAULT_ORDER_DELETE_DAYS = 90;

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
