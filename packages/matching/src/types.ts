import type {
  AddressSource,
  MatchingMode,
  Money,
  OrderStatus,
} from "@paymentgate/domain";

/**
 * Andrew implements against payment_orders under a create-order transaction lock.
 * Scope: merchant (org) + receive address + asset + network.
 * Return payable_amount strings for MODE_C_RESERVED_STATUSES only.
 */
export type ListReservedPayableAmounts = (query: {
  merchantId: string;
  asset: string;
  network: string;
  receiveAddress: string;
}) => Promise<readonly string[]>;

/**
 * Andrew lists memo_or_tag for open Mode D orders (MODE_D_RESERVED_STATUSES)
 * under the same create-order lock scope as Mode C.
 */
export type ListReservedMemoOrTags = (query: {
  merchantId: string;
  asset: string;
  network: string;
  receiveAddress: string;
}) => Promise<readonly string[]>;

/**
 * Andrew: true if any open order (MODE_S_CONFLICT_STATUSES) already claims this
 * payable amount for merchant + asset + network (main or HD). Under create lock.
 */
export type HasModeSSameAmountConflict = (query: {
  merchantId: string;
  asset: string;
  network: string;
  payableAmount: string;
  mainSettlementAddress: string;
}) => Promise<boolean>;

/**
 * Andrew: atomic FREE claim or derive-next from merchant xPub (watch-only).
 * Never called from matching with private keys — API owns derivation material.
 */
export type ClaimHdPoolAddress = (query: {
  merchantId: string;
  asset: string;
  network: string;
}) => Promise<{ receiveAddress: string; hdIndex: number }>;

export type AssignInput = {
  mode: MatchingMode;
  merchantId: string;
  asset: string;
  network: string;
  requestedAmount: string;
  mainSettlementAddress: string;
  /** Required for Mode C */
  listReservedPayableAmounts?: ListReservedPayableAmounts;
  /** Required for Mode D when memoSupported (idempotency key or provisional id) */
  memoSeed?: string;
  /** Required for Mode D when memoSupported */
  listReservedMemoOrTags?: ListReservedMemoOrTags;
  /**
   * Mode S: merchant has watch-only xPub for this asset/network.
   * If false/omitted → fall back to Mode B (main address only).
   */
  xPubConfigured?: boolean;
  /** Mode S: required when xPubConfigured */
  hasModeSSameAmountConflict?: HasModeSSameAmountConflict;
  /** Mode S: required when conflict and xPubConfigured */
  claimHdPoolAddress?: ClaimHdPoolAddress;
};

/** Aligns with domain PaymentOrderAssignFields (camelCase at package boundary). */
export type AssignResult = {
  payableAmount: Money;
  receiveAddress: string;
  addressSource: AddressSource;
  /** Null unless Mode S assigned an HD pool index */
  hdIndex: number | null;
  /** Null unless Mode D assigned a memo/tag */
  memoOrTag: string | null;
};

export type MatchCandidateOrder = {
  orderId: string;
  payableAmount: string;
  receiveAddress: string;
  asset: string;
  network: string;
  /** Mode D — expected memo/tag on the order (null/omit for B/C/S). */
  memoOrTag?: string | null;
  /** ISO-8601; if in the past, order is excluded from successful match (late → anomaly if sole candidate) */
  expiresAt?: string;
  /**
   * Mode B: major-unit underpay tolerance locked at order create.
   * Prefer this over MatchInput.underpayTolerance when both set.
   */
  underpayTolerance?: string;
};

export type MatchInput = {
  mode: MatchingMode;
  toAddress: string;
  amount: string;
  asset: string;
  network: string;
  /** On-chain memo/tag (Mode D). Missing/wrong → anomaly. */
  memoOrTag?: string;
  txHash: string;
  /**
   * Open orders at this address / asset / network (watcher loads from payment_orders).
   * Required for Mode B / C / D match.
   */
  candidates?: readonly MatchCandidateOrder[];
  /** Optional clock for expiry checks (tests). Default Date.now(). */
  nowMs?: number;
  /**
   * Mode B only: major-unit underpay tolerance. Amounts short by at most this
   * still match. Mode C must keep this 0 / unused (fingerprints stay exact).
   */
  underpayTolerance?: string;
};

export type MatchResult = {
  orderId?: string;
  /** Mode B same-amount collision — all ambiguous open orders (never FIFO-pick one). */
  orderIds?: string[];
  status: OrderStatus;
  reason?: string;
};
