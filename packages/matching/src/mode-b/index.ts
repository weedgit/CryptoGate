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
} from "@paymentgate/domain";
import { majorToMinor } from "../amount.js";
import { matchExactPayable } from "../match-exact.js";
import type {
  AssignInput,
  AssignResult,
  MatchInput,
  MatchResult,
} from "../types.js";

const AMOUNT_RE = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

/**
 * Live Mode B tickets that block creating another same amount on the main
 * settlement address. Payment Anomaly is history/reconcile — it must not lock
 * the amount forever (staff can open a new ticket; match-time safety net remains).
 */
export const MODE_B_CREATE_BLOCK_STATUSES = [
  OrderStatus.PendingPayment,
  OrderStatus.Verifying,
  OrderStatus.Confirmed,
] as const;

function isAssetCode(value: string): value is AssetCodeType {
  return (Object.values(AssetCode) as string[]).includes(value);
}

function isNetworkId(value: string): value is NetworkIdType {
  return (Object.values(NetworkId) as string[]).includes(value);
}

export { majorToMinor } from "../amount.js";

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

/**
 * Mode B match (M3-60): exact address + asset + network + payable.
 * Same-amount collision among open candidates → payment_anomaly (never FIFO).
 */
export async function matchModeB(input: MatchInput): Promise<MatchResult> {
  return matchExactPayable(input, "B", {
    exact: "mode_b_exact_match",
    collision: "mode_b_same_amount_collision",
    underpay: "mode_b_underpay",
    overpay: "mode_b_overpay",
  });
}
