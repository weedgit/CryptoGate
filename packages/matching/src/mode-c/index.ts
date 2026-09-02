/**
 * Mode C — amount fingerprint: unique payable among open orders on same
 * main address / asset / network. Base layer still Mode B (main address).
 * Reservation list comes from API (DB under lock) — matching stays DB-free.
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

/** Statuses whose payable_amount must stay reserved for Mode C. */
export const MODE_C_RESERVED_STATUSES = [
  OrderStatus.PendingPayment,
  OrderStatus.Verifying,
  OrderStatus.Confirmed,
  OrderStatus.PaymentAnomaly,
] as const;

/** Max upward steps from requested amount before failing create. */
export const MODE_C_MAX_FINGERPRINT_STEPS = 10_000;

function isAssetCode(value: string): value is AssetCodeType {
  return (Object.values(AssetCode) as string[]).includes(value);
}

function isNetworkId(value: string): value is NetworkIdType {
  return (Object.values(NetworkId) as string[]).includes(value);
}

/** Minor units → major-unit decimal string (fixed fractional width). */
export function minorToMajor(minor: bigint, decimals: number): string {
  if (decimals < 0) {
    throw new Error("decimals must be non-negative");
  }
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0");
  const body =
    decimals === 0 ? whole.toString() : `${whole.toString()}.${frac}`;
  return negative ? `-${body}` : body;
}

function fractionDigits(amountStep: string): number {
  const dot = amountStep.indexOf(".");
  return dot < 0 ? 0 : amountStep.length - dot - 1;
}

/** Format payable using amountStep precision when the minor value aligns. */
export function formatPayableAmount(
  minor: bigint,
  assetDecimals: number,
  amountStep: string,
): string {
  const displayDecimals = fractionDigits(amountStep);
  if (displayDecimals > assetDecimals) {
    return minorToMajor(minor, assetDecimals);
  }
  const scale = 10n ** BigInt(assetDecimals - displayDecimals);
  if (minor % scale !== 0n) {
    return minorToMajor(minor, assetDecimals);
  }
  return minorToMajor(minor / scale, displayDecimals);
}

/**
 * Pick the smallest payable >= requested that is not in reserved (minor units),
 * stepping by amountStep. Pure — used by assignModeC and tests.
 */
export function pickUniquePayableMinor(
  requestedMinor: bigint,
  stepMinor: bigint,
  reservedMinors: ReadonlySet<bigint>,
  maxSteps: number = MODE_C_MAX_FINGERPRINT_STEPS,
): bigint {
  if (stepMinor <= 0n) {
    throw new Error("amountStep must be positive");
  }
  let candidate = requestedMinor;
  for (let i = 0; i <= maxSteps; i++) {
    if (!reservedMinors.has(candidate)) {
      return candidate;
    }
    candidate += stepMinor;
  }
  throw new Error(
    "no free Mode C fingerprint slot within allowed range — refuse create",
  );
}

export async function assignModeC(input: AssignInput): Promise<AssignResult> {
  if (input.mode !== "C") {
    throw new Error(`assignModeC requires mode C, got ${input.mode}`);
  }

  if (!input.listReservedPayableAmounts) {
    throw new Error(
      "listReservedPayableAmounts is required for Mode C (API supplies open-order amounts under lock)",
    );
  }

  if (!isAssetCode(input.asset)) {
    throw new Error(`unsupported asset: ${input.asset}`);
  }
  if (!isNetworkId(input.network)) {
    throw new Error(`unsupported network: ${input.network}`);
  }

  const address = input.mainSettlementAddress.trim();
  if (!address) {
    throw new Error("mainSettlementAddress is required for Mode C");
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

  const requestedMinor = majorToMinor(amount, config.decimals);
  const minMinor = majorToMinor(config.minAmount, config.decimals);
  if (requestedMinor < minMinor) {
    throw new Error(
      `requestedAmount below minAmount ${config.minAmount} ${config.asset}`,
    );
  }

  const stepMinor = majorToMinor(config.amountStep, config.decimals);
  if (stepMinor <= 0n) {
    throw new Error("registry amountStep must be positive");
  }

  const reservedRaw = await input.listReservedPayableAmounts({
    merchantId: input.merchantId,
    asset: input.asset,
    network: input.network,
    receiveAddress: address,
  });

  const reservedMinors = new Set<bigint>();
  for (const raw of reservedRaw) {
    const trimmed = raw.trim();
    if (!AMOUNT_RE.test(trimmed)) {
      throw new Error(`invalid reserved payable_amount from store: ${raw}`);
    }
    reservedMinors.add(majorToMinor(trimmed, config.decimals));
  }

  const payableMinor = pickUniquePayableMinor(
    requestedMinor,
    stepMinor,
    reservedMinors,
  );
  const payableAmount = formatPayableAmount(
    payableMinor,
    config.decimals,
    config.amountStep,
  );

  return {
    payableAmount: {
      amount: payableAmount,
      currency: input.asset,
    },
    receiveAddress: address,
    addressSource: AddressSource.Main,
    hdIndex: null,
    memoOrTag: null,
  };
}

/**
 * Mode C match (M3-61): exact fingerprint payable among open orders.
 * Fingerprints are unique at assign; duplicate exact matches → anomaly (data bug, never FIFO).
 */
export async function matchModeC(input: MatchInput): Promise<MatchResult> {
  return matchExactPayable(input, "C", {
    exact: "mode_c_exact_match",
    collision: "mode_c_fingerprint_collision",
    underpay: "mode_c_underpay",
    overpay: "mode_c_overpay",
  });
}
