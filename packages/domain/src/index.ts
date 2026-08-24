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
 * Money amount as a decimal string in major units (avoid float).
 * Example: "50.01" USDT.
 */
export type Money = {
  amount: string;
  currency: AssetCode;
};

/** First Sprint 0 / M3 target pair. */
export const DEFAULT_ASSET_NETWORK: AssetNetwork = {
  asset: AssetCode.USDT,
  network: NetworkId.Tron,
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
