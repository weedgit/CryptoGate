/**
 * Shared exact payable match for Mode B and Mode C (fingerprint is still exact amount).
 * Collision among 2+ exact matches → anomaly (never FIFO).
 */
import {
  AssetCode,
  NetworkId,
  OrderStatus,
  getAssetNetworkConfig,
  type AssetCode as AssetCodeType,
  type MatchingMode,
  type NetworkId as NetworkIdType,
} from "@cryptogate/domain";
import { majorToMinor } from "./amount.js";
import type {
  MatchCandidateOrder,
  MatchInput,
  MatchResult,
} from "./types.js";

const AMOUNT_RE = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export type ExactMatchReasonCodes = {
  exact: string;
  collision: string;
  underpay: string;
  overpay: string;
};

function isAssetCode(value: string): value is AssetCodeType {
  return (Object.values(AssetCode) as string[]).includes(value);
}

function isNetworkId(value: string): value is NetworkIdType {
  return (Object.values(NetworkId) as string[]).includes(value);
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

export async function matchExactPayable(
  input: MatchInput,
  expectedMode: MatchingMode,
  reasons: ExactMatchReasonCodes,
): Promise<MatchResult> {
  if (input.mode !== expectedMode) {
    throw new Error(
      `match expects mode ${expectedMode}, got ${input.mode}`,
    );
  }

  if (!isAssetCode(input.asset)) {
    throw new Error(`unsupported asset: ${input.asset}`);
  }
  if (!isNetworkId(input.network)) {
    throw new Error(`unsupported network: ${input.network}`);
  }

  const toAddress = input.toAddress.trim();
  if (!toAddress) {
    throw new Error("toAddress is required for match");
  }

  const amount = input.amount.trim();
  if (!AMOUNT_RE.test(amount)) {
    throw new Error(
      "amount must be a non-negative major-unit decimal string",
    );
  }

  if (!input.txHash?.trim()) {
    throw new Error("txHash is required for match");
  }

  if (!input.candidates) {
    throw new Error(
      "candidates is required for match (watcher loads open orders at address)",
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
    const tolRaw =
      (order.underpayTolerance ?? input.underpayTolerance ?? "0").trim() ||
      "0";
    if (!AMOUNT_RE.test(tolRaw)) {
      throw new Error(
        `underpayTolerance must be a non-negative major-unit decimal string (order ${order.orderId})`,
      );
    }
    const tolMinor = majorToMinor(tolRaw, config.decimals);
    const allowUnderpayTol = expectedMode === "B" && tolMinor > 0n;

    if (payableMinor === receivedMinor) {
      exact.push(order);
    } else if (
      allowUnderpayTol &&
      receivedMinor < payableMinor &&
      payableMinor - receivedMinor <= tolMinor
    ) {
      exact.push(order);
    } else {
      amountMismatches.push(order);
    }
  }

  if (exact.length >= 2) {
    return {
      status: OrderStatus.PaymentAnomaly,
      orderIds: exact.map((o) => o.orderId),
      reason: reasons.collision,
    };
  }

  if (exact.length === 1) {
    return {
      orderId: exact[0]!.orderId,
      status: OrderStatus.Verifying,
      reason: reasons.exact,
    };
  }

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
        receivedMinor < payableMinor ? reasons.underpay : reasons.overpay,
    };
  }

  return {
    status: OrderStatus.PendingPayment,
    reason: "no_exact_amount_match",
  };
}
