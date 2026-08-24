import type {
  AddressSource,
  MatchingMode,
  Money,
  OrderStatus,
} from "@cryptogate/domain";

export type AssignInput = {
  mode: MatchingMode;
  merchantId: string;
  asset: string;
  network: string;
  requestedAmount: string;
  mainSettlementAddress: string;
};

/** Aligns with domain PaymentOrderAssignFields (camelCase at package boundary). */
export type AssignResult = {
  payableAmount: Money;
  receiveAddress: string;
  addressSource: AddressSource;
  hdIndex?: number;
  memoOrTag?: string;
};

export type MatchInput = {
  mode: MatchingMode;
  toAddress: string;
  amount: string;
  asset: string;
  network: string;
  memoOrTag?: string;
  txHash: string;
};

export type MatchResult = {
  orderId?: string;
  status: OrderStatus;
  reason?: string;
};
