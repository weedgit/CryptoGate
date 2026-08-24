/**
 * Mode S — Smart address: main unless same-amount conflict, then HD pool claim.
 * Matching never holds keys, derives, signs, or sweeps — Andrew supplies claimHdPoolAddress.
 * Pool FREE / IN_USE / COOLDOWN transitions: mode-s/pool.ts (M2-44); API owns DB.
 */
import {
  AddressSource,
  AssetCode,
  NetworkId,
  OrderStatus,
  getAssetNetworkConfig,
  type AddressSource as AddressSourceType,
  type AssetCode as AssetCodeType,
  type NetworkId as NetworkIdType,
} from "@cryptogate/domain";
import { majorToMinor } from "../amount.js";
import { matchExactPayable } from "../match-exact.js";
import type { AssignInput, AssignResult, MatchInput, MatchResult } from "../types.js";

const AMOUNT_RE = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

/** Open statuses that count as a same-amount conflict for Mode S. */
export const MODE_S_CONFLICT_STATUSES = [
  OrderStatus.PendingPayment,
  OrderStatus.Verifying,
  OrderStatus.Confirmed,
  OrderStatus.PaymentAnomaly,
] as const;

function isAssetCode(value: string): value is AssetCodeType {
  return (Object.values(AssetCode) as string[]).includes(value);
}

function isNetworkId(value: string): value is NetworkIdType {
  return (Object.values(NetworkId) as string[]).includes(value);
}

/** Pure: conflict → hd_pool, else main. */
export function modeSAddressSource(hasConflict: boolean): AddressSourceType {
  return hasConflict ? AddressSource.HdPool : AddressSource.Main;
}

export async function assignModeS(input: AssignInput): Promise<AssignResult> {
  if (input.mode !== "S") {
    throw new Error(`assignModeS requires mode S, got ${input.mode}`);
  }

  if (!isAssetCode(input.asset)) {
    throw new Error(`unsupported asset: ${input.asset}`);
  }
  if (!isNetworkId(input.network)) {
    throw new Error(`unsupported network: ${input.network}`);
  }
  const asset = input.asset;
  const network = input.network;

  const address = input.mainSettlementAddress.trim();
  if (!address) {
    throw new Error("mainSettlementAddress is required for Mode S");
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

  const config = getAssetNetworkConfig(asset, network);
  if (!config) {
    throw new Error(
      `asset/network not enabled in registry: ${asset}/${network}`,
    );
  }

  const minor = majorToMinor(amount, config.decimals);
  const minMinor = majorToMinor(config.minAmount, config.decimals);
  if (minor < minMinor) {
    throw new Error(
      `requestedAmount below minAmount ${config.minAmount} ${config.asset}`,
    );
  }

  const payable = {
    amount,
    currency: asset,
  };

  // No xPub → Mode S unavailable; fall back to Mode B (main only). Phase1 §2.5.
  if (!input.xPubConfigured) {
    return {
      payableAmount: payable,
      receiveAddress: address,
      addressSource: AddressSource.Main,
      hdIndex: null,
      memoOrTag: null,
    };
  }

  if (!input.hasModeSSameAmountConflict) {
    throw new Error(
      "hasModeSSameAmountConflict is required for Mode S when xPub is configured (API: open orders under lock)",
    );
  }

  const hasConflict = await input.hasModeSSameAmountConflict({
    merchantId: input.merchantId,
    asset,
    network,
    payableAmount: amount,
    mainSettlementAddress: address,
  });

  if (!hasConflict) {
    return {
      payableAmount: payable,
      receiveAddress: address,
      addressSource: AddressSource.Main,
      hdIndex: null,
      memoOrTag: null,
    };
  }

  if (!input.claimHdPoolAddress) {
    throw new Error(
      "claimHdPoolAddress is required for Mode S on same-amount conflict (API: FREE claim or derive next index)",
    );
  }

  const claimed = await input.claimHdPoolAddress({
    merchantId: input.merchantId,
    asset,
    network,
  });

  const hdAddress = claimed.receiveAddress?.trim() ?? "";
  if (!hdAddress) {
    throw new Error("claimHdPoolAddress returned empty receiveAddress");
  }
  if (/\s/.test(hdAddress)) {
    throw new Error("claimHdPoolAddress receiveAddress must not contain whitespace");
  }
  if (hdAddress === address) {
    throw new Error(
      "claimHdPoolAddress must not return the main settlement address",
    );
  }
  if (
    !Number.isInteger(claimed.hdIndex) ||
    claimed.hdIndex < 0
  ) {
    throw new Error("claimHdPoolAddress hdIndex must be a non-negative integer");
  }

  return {
    payableAmount: payable,
    receiveAddress: hdAddress,
    addressSource: AddressSource.HdPool,
    hdIndex: claimed.hdIndex,
    memoOrTag: null,
  };
}

/**
 * Mode S match (M3-63): bind by owned receive address (main or HD) + exact payable.
 * Distinct HD addresses make same-amount open orders unambiguous; if two candidates
 * still share address+amount → anomaly (never FIFO). Pool COOLDOWN→FREE is API-owned.
 */
export async function matchModeS(input: MatchInput): Promise<MatchResult> {
  return matchExactPayable(input, "S", {
    exact: "mode_s_exact_match",
    collision: "mode_s_same_amount_collision",
    underpay: "mode_s_underpay",
    overpay: "mode_s_overpay",
  });
}
