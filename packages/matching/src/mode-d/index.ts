/**
 * Mode D — memo / destination tag on top of Mode B (main address + payable = requested).
 * Only when registry memoSupported is true. USDT Tron and similar must reject.
 * Matching does not query DB — API supplies reserved memos under lock.
 */
import {
  AddressSource,
  AssetCode,
  NetworkId,
  OrderStatus,
  getAssetNetworkConfig,
  type AssetCode as AssetCodeType,
  type AssetNetworkConfig,
  type NetworkId as NetworkIdType,
} from "@cryptogate/domain";
import { majorToMinor } from "../amount.js";
import type { AssignInput, AssignResult } from "../types.js";

const AMOUNT_RE = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

/** Same open-order statuses as Mode C — memo stays reserved while order can still match. */
export const MODE_D_RESERVED_STATUSES = [
  OrderStatus.PendingPayment,
  OrderStatus.Verifying,
  OrderStatus.Confirmed,
  OrderStatus.PaymentAnomaly,
] as const;

export const MODE_D_MAX_MEMO_ATTEMPTS = 10_000;
/** Typical memo / destination-tag safe length (conservative). */
export const MODE_D_MAX_MEMO_LENGTH = 28;

function isAssetCode(value: string): value is AssetCodeType {
  return (Object.values(AssetCode) as string[]).includes(value);
}

function isNetworkId(value: string): value is NetworkIdType {
  return (Object.values(NetworkId) as string[]).includes(value);
}

/** Sanitize API seed into a memo-safe token (alphanumeric + underscore). */
export function sanitizeMemoSeed(seed: string): string {
  const cleaned = seed.trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^[_-]+|[_-]+$/g, "");
  if (!cleaned) {
    throw new Error("memoSeed must contain at least one alphanumeric character");
  }
  return cleaned.slice(0, MODE_D_MAX_MEMO_LENGTH - 3); // leave room for CG- prefix
}

/** Build candidate memo from seed; bump with -n when reserved. */
export function pickUniqueMemoOrTag(
  seed: string,
  reserved: ReadonlySet<string>,
  maxAttempts: number = MODE_D_MAX_MEMO_ATTEMPTS,
): string {
  const base = `CG-${sanitizeMemoSeed(seed)}`.slice(0, MODE_D_MAX_MEMO_LENGTH);
  if (!reserved.has(base)) {
    return base;
  }
  for (let n = 2; n <= maxAttempts + 1; n++) {
    const suffix = `-${n}`;
    const truncated = base.slice(0, MODE_D_MAX_MEMO_LENGTH - suffix.length);
    const candidate = `${truncated}${suffix}`;
    if (!reserved.has(candidate)) {
      return candidate;
    }
  }
  throw new Error("no free Mode D memo/tag within allowed range — refuse create");
}

function validateBaseLayer(
  input: AssignInput,
  config: AssetNetworkConfig,
): { address: string; amount: string } {
  const address = input.mainSettlementAddress.trim();
  if (!address) {
    throw new Error("mainSettlementAddress is required for Mode D");
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

  const minor = majorToMinor(amount, config.decimals);
  const minMinor = majorToMinor(config.minAmount, config.decimals);
  if (minor < minMinor) {
    throw new Error(
      `requestedAmount below minAmount ${config.minAmount} ${config.asset}`,
    );
  }

  return { address, amount };
}

/**
 * Core Mode D assign against an injected registry row (tests + assignModeD).
 * Rejects when memoSupported is false.
 */
export async function assignModeDForConfig(
  input: AssignInput,
  config: AssetNetworkConfig,
): Promise<AssignResult> {
  if (input.mode !== "D") {
    throw new Error(`assignModeD requires mode D, got ${input.mode}`);
  }

  const { address, amount } = validateBaseLayer(input, config);

  if (!config.memoSupported) {
    throw new Error(
      `Mode D unavailable: memo not supported for ${config.asset}/${config.network} (registry memoSupported=false)`,
    );
  }

  const seed = input.memoSeed?.trim() ?? "";
  if (!seed) {
    throw new Error(
      "memoSeed is required for Mode D (API: idempotency key or provisional order id)",
    );
  }
  if (!input.listReservedMemoOrTags) {
    throw new Error(
      "listReservedMemoOrTags is required for Mode D (API supplies open-order memos under lock)",
    );
  }

  const reservedRaw = await input.listReservedMemoOrTags({
    merchantId: input.merchantId,
    asset: input.asset,
    network: input.network,
    receiveAddress: address,
  });
  const reserved = new Set(
    reservedRaw.map((m) => m.trim()).filter((m) => m.length > 0),
  );
  const memoOrTag = pickUniqueMemoOrTag(seed, reserved);

  return {
    payableAmount: {
      amount,
      currency: config.asset,
    },
    receiveAddress: address,
    addressSource: AddressSource.Main,
    hdIndex: null,
    memoOrTag,
  };
}

export async function assignModeD(input: AssignInput): Promise<AssignResult> {
  if (!isAssetCode(input.asset)) {
    throw new Error(`unsupported asset: ${input.asset}`);
  }
  if (!isNetworkId(input.network)) {
    throw new Error(`unsupported network: ${input.network}`);
  }

  const config = getAssetNetworkConfig(input.asset, input.network);
  if (!config) {
    throw new Error(
      `asset/network not enabled in registry: ${input.asset}/${input.network}`,
    );
  }

  return assignModeDForConfig(input, config);
}
