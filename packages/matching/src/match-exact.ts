/**
 * Shared exact payable match for Mode B and Mode C (fingerprint is still exact amount).
 * Collision among 2+ exact matches → anomaly (never FIFO).
 *
 * Platform dustFloor (asset registry): sole-order delta ≤ dust → paid; unmatched
 * inbound ≤ dust → ignored (no Attention). Dust must stay < Mode C amountStep.
 */
import {
  AssetCode,
  NetworkId,
  OrderStatus,
  getAssetNetworkConfig,
  sameAddress,
  type AssetCode as AssetCodeType,
  type MatchingMode,
  type NetworkId as NetworkIdType,
} from "@paymentgate/domain";
import { majorToMinor } from "./amount.js";
import { filterEligibleCandidates } from "./transfer-eligibility.js";
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

function isExpired(order: MatchCandidateOrder, nowMs: number): boolean {
  if (!order.expiresAt) return false;
  const exp = Date.parse(order.expiresAt);
  if (Number.isNaN(exp)) return false;
  return exp <= nowMs;
}

function absDiff(a: bigint, b: bigint): bigint {
  return a >= b ? a - b : b - a;
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
  const dustRaw = (config.dustFloor ?? "0").trim() || "0";
  if (!AMOUNT_RE.test(dustRaw)) {
    throw new Error(
      `dustFloor must be a non-negative major-unit decimal string (${input.asset}/${input.network})`,
    );
  }
  const dustMinor = majorToMinor(dustRaw, config.decimals);
  const stepMinor = majorToMinor(config.amountStep, config.decimals);
  if (dustMinor > 0n && dustMinor >= stepMinor) {
    throw new Error(
      `dustFloor must be strictly less than amountStep (${input.asset}/${input.network})`,
    );
  }

  const scoped = input.candidates.filter(
    (o) =>
      o.asset === input.asset &&
      o.network === input.network &&
      sameAddress(input.network, o.receiveAddress, toAddress),
  );

  if (scoped.length === 0) {
    if (dustMinor > 0n && receivedMinor <= dustMinor) {
      return {
        status: OrderStatus.PendingPayment,
        reason: "dust_ignored",
      };
    }
    return {
      status: OrderStatus.PendingPayment,
      reason: "no_open_order_at_address",
    };
  }

  const eligible = filterEligibleCandidates(scoped, input.transferAtMs);
  if (eligible.length === 0) {
    if (dustMinor > 0n && receivedMinor <= dustMinor) {
      return {
        status: OrderStatus.PendingPayment,
        reason: "dust_ignored",
      };
    }
    return {
      status: OrderStatus.PendingPayment,
      reason:
        input.transferAtMs !== undefined
          ? "transfer_before_order_created"
          : "no_open_order_at_address",
    };
  }

  /** True when this payment settles `order` (exact, within dust, or Mode B tolerance). */
  const amountFits = (order: MatchCandidateOrder): boolean => {
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
    // Merchant underpayTolerance remains Mode B only; dustFloor is platform-wide.
    const allowUnderpayTol = expectedMode === "B" && tolMinor > 0n;
    const delta = absDiff(payableMinor, receivedMinor);
    // Dust absorbs rounding, never more than 1% of the order: 0.1 TRX dust on a 1 TRX order
    // accepted a 10% underpay (review M3).
    const percent = payableMinor / 100n;
    const orderDust = dustMinor < percent ? dustMinor : percent;

    if (payableMinor === receivedMinor) return true;
    if (orderDust > 0n && delta <= orderDust) return true;
    return (
      allowUnderpayTol &&
      receivedMinor < payableMinor &&
      payableMinor - receivedMinor <= tolMinor
    );
  };

  // Expiry is judged when the payment was mined, not when the watcher saw it (review M2).
  const paidAtMs =
    input.transferAtMs !== undefined && Number.isFinite(input.transferAtMs)
      ? input.transferAtMs
      : nowMs;
  const unexpired = eligible.filter((o) => !isExpired(o, paidAtMs));
  const expired = eligible.filter((o) => isExpired(o, paidAtMs));

  if (unexpired.length === 0) {
    // Only expired orders this payment fits are flagged: a top-up to a shared address must not
    // flag a week of expired orders. A one-order HD address (Mode S) still flags its order.
    const fitting = expired.filter(amountFits);
    const flagged =
      fitting.length > 0
        ? fitting
        : expectedMode === "S" && expired.length === 1
          ? expired
          : [];
    if (flagged.length === 0) {
      return {
        status: OrderStatus.PendingPayment,
        reason: "no_open_order_at_address",
      };
    }
    return {
      status: OrderStatus.PaymentAnomaly,
      orderIds: flagged.map((o) => o.orderId),
      reason: "late_payment_after_expiry",
    };
  }

  const exact: MatchCandidateOrder[] = [];
  const amountMismatches: MatchCandidateOrder[] = [];

  for (const order of unexpired) {
    if (amountFits(order)) exact.push(order);
    else amountMismatches.push(order);
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

  // Unmatched dust on a shared wallet — do not open Attention (cannot attribute).
  if (dustMinor > 0n && receivedMinor <= dustMinor) {
    return {
      status: OrderStatus.PendingPayment,
      reason: "dust_ignored",
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
