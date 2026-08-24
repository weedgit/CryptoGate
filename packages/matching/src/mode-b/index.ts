/**
 * Mode B — Standard: fixed merchant settlement address + payable = requested amount.
 * Assign does not detect collisions; matchModeB / matchTransaction does (never FIFO).
 * Never derives HD addresses or memos.
 */
import {
  AddressSource,
  AssetCode,
  NetworkId,
  OrderStatus,
  getAssetNetworkConfig,
  type AssetCode as AssetCodeType,
  type NetworkId as NetworkIdType,
} from "@cryptogate/domain";
import type {
  AssignInput,
  AssignResult,
  MatchCandidateOrder,
  MatchInput,
  MatchResult,
} from "../types.js";

const AMOUNT_RE = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function isAssetCode(value: string): value is AssetCodeType {
  return (Object.values(AssetCode) as string[]).includes(value);
}

function isNetworkId(value: string): value is NetworkIdType {
  return (Object.values(NetworkId) as string[]).includes(value);
}

/** Major-unit decimal → minor units (integer). Rejects excess fractional digits. */
export function majorToMinor(amount: string, decimals: number): bigint {
  const parts = amount.split(".");
  const wholeRaw = parts[0] ?? "";
  const fracRaw = parts[1] ?? "";
  if (fracRaw.length > decimals) {
    throw new Error(
      `requestedAmount has more than ${decimals} decimal places`,
    );
  }
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  const frac = fracRaw.padEnd(decimals, "0");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac || "0");
}

export async function assignModeB(input: AssignInput): Promise<AssignResult> {
  if (input.mode !== "B") {
    throw new Error(`assignModeB requires mode B, got ${input.mode}`);
  }

  if (!isAssetCode(input.asset)) {
    throw new Error(`unsupported asset: ${input.asset}`);
  }
  if (!isNetworkId(input.network)) {
    throw new Error(`unsupported network: ${input.network}`);
  }

  const address = input.mainSettlementAddress.trim();
  if (!address) {
    throw new Error("mainSettlementAddress is required for Mode B");
  }
  if (/\s/.test(address)) {
    throw new Error("mainSettlementAddress must not contain whitespace");
  }

  const amount = input.requestedAmount.trim();
  if (!AMOUNT_RE.test(amount)) {
    throw new Error(
      "requestedAmount must be a non-negative major-unit decimal string",
    );
  }

  const config = getAssetNetworkConfig(input.asset, input.network);
  if (!config) {
    throw new Error(
      `asset/network not enabled in registry: ${input.asset}/${input.network}`,
    );
  }

  const minor = majorToMinor(amount, config.decimals);
  const minMinor = majorToMinor(config.minAmount, config.decimals);
  if (minor < minMinor) {
    throw new Error(
      `requestedAmount below minAmount ${config.minAmount} ${config.asset}`,
    );
  }

  return {
    payableAmount: {
      amount,
      currency: input.asset,
    },
    receiveAddress: address,
    addressSource: AddressSource.Main,
    hdIndex: null,
    memoOrTag: null,
  };
}

function addressesEqual(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

function isExpired(order: MatchCandidateOrder, nowMs: number): boolean {
  if (!order.expiresAt) return false;
  const exp = Date.parse(order.expiresAt);
  if (Number.isNaN(exp)) return false;
  return exp <= nowMs;
}

/**
 * Mode B match (M3-60): exact address + asset + network + payable.
 * Same-amount collision among open candidates → payment_anomaly (never FIFO).
 * Unique exact match → verifying. Wrong amount on a single open order → anomaly.
 */
export async function matchModeB(input: MatchInput): Promise<MatchResult> {
  if (input.mode !== "B") {
    throw new Error(`matchModeB requires mode B, got ${input.mode}`);
  }

  if (!isAssetCode(input.asset)) {
    throw new Error(`unsupported asset: ${input.asset}`);
  }
  if (!isNetworkId(input.network)) {
    throw new Error(`unsupported network: ${input.network}`);
  }

  const toAddress = input.toAddress.trim();
  if (!toAddress) {
    throw new Error("toAddress is required for Mode B match");
  }

  const amount = input.amount.trim();
  if (!AMOUNT_RE.test(amount)) {
    throw new Error(
      "amount must be a non-negative major-unit decimal string",
    );
  }

  if (!input.txHash?.trim()) {
    throw new Error("txHash is required for Mode B match");
  }

  if (!input.candidates) {
    throw new Error(
      "candidates is required for Mode B match (watcher loads open orders at address)",
    );
  }

  const config = getAssetNetworkConfig(input.asset, input.network);
  if (!config) {
    throw new Error(
      `asset/network not enabled in registry: ${input.asset}/${input.network}`,
    );
  }

  const nowMs = input.nowMs ?? Date.now();
  const receivedMinor = majorToMinor(amount, config.decimals);

  const scoped = input.candidates.filter(
    (o) =>
      addressesEqual(o.receiveAddress, toAddress) &&
      o.asset === input.asset &&
      o.network === input.network,
  );

  if (scoped.length === 0) {
    return {
      status: OrderStatus.PendingPayment,
      reason: "no_open_order_at_address",
    };
  }

  const unexpired = scoped.filter((o) => !isExpired(o, nowMs));
  const expired = scoped.filter((o) => isExpired(o, nowMs));

  if (unexpired.length === 0) {
    return {
      status: OrderStatus.PaymentAnomaly,
      orderIds: expired.map((o) => o.orderId),
      reason: "late_payment_after_expiry",
    };
  }

  const exact: MatchCandidateOrder[] = [];
  const amountMismatches: MatchCandidateOrder[] = [];

  for (const order of unexpired) {
    const payable = order.payableAmount.trim();
    if (!AMOUNT_RE.test(payable)) {
      throw new Error(
        `invalid candidate payableAmount for order ${order.orderId}`,
      );
    }
    const payableMinor = majorToMinor(payable, config.decimals);
    if (payableMinor === receivedMinor) {
      exact.push(order);
    } else {
      amountMismatches.push(order);
    }
  }

  if (exact.length >= 2) {
    return {
      status: OrderStatus.PaymentAnomaly,
      orderIds: exact.map((o) => o.orderId),
      reason: "mode_b_same_amount_collision",
    };
  }

  if (exact.length === 1) {
    return {
      orderId: exact[0]!.orderId,
      status: OrderStatus.Verifying,
      reason: "mode_b_exact_match",
    };
  }

  // No exact match among unexpired
  if (unexpired.length === 1 && amountMismatches.length === 1) {
    const only = amountMismatches[0]!;
    const payableMinor = majorToMinor(
      only.payableAmount.trim(),
      config.decimals,
    );
    return {
      orderId: only.orderId,
      status: OrderStatus.PaymentAnomaly,
      reason:
        receivedMinor < payableMinor
          ? "mode_b_underpay"
          : "mode_b_overpay",
    };
  }

  return {
    status: OrderStatus.PendingPayment,
    reason: "no_exact_amount_match",
  };
}
