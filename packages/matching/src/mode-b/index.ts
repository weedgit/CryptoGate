/**
 * Mode B — Standard: fixed merchant settlement address + payable = requested amount.
 * Collision / anomaly detection is watcher matchTransaction (M3), not assign.
 * Never derives HD addresses or memos.
 */
import {
  AddressSource,
  AssetCode,
  NetworkId,
  getAssetNetworkConfig,
  type AssetCode as AssetCodeType,
  type NetworkId as NetworkIdType,
} from "@cryptogate/domain";
import type { AssignInput, AssignResult } from "../types.js";

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
