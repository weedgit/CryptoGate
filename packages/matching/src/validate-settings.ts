/**
 * Merchant matching-settings policy (M2-45).
 * Called by API / merchant UI before saving mode — not a substitute for per-order assign.
 * Mode is singular (B|C|D|S); secondary flags catch illegal stacked collision strategies.
 */
import { majorToMinor } from "./amount.js";
import { MatchingMode, type MatchingMode as MatchingModeType } from "@cryptogate/domain";

const AMOUNT_RE = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export type MatchingSettingsInput = {
  mode: MatchingModeType;
  /**
   * Secondary "also use Smart address" flag (illegal with Mode C / amount fingerprint).
   * Prefer singular `mode: "S"` without fingerprint.
   */
  smartAddressEnabled?: boolean;
  /**
   * Secondary "also use amount fingerprint" flag (illegal with Mode S).
   * Prefer singular `mode: "C"`.
   */
  amountFingerprintEnabled?: boolean;
  /**
   * Major-unit underpay tolerance. Mode C requires 0 or strictly less than amountStep.
   * Omit or "0" when exact pay.
   */
  underpayTolerance?: string;
  /** Registry amountStep for the asset/network (required when checking Mode C underpay). */
  amountStep?: string;
  /** Asset decimals (required with amountStep for underpay check). */
  decimals?: number;
};

export type MatchingSettingsValidation =
  | { ok: true }
  | { ok: false; code: string; message: string };

function isMatchingMode(value: string): value is MatchingModeType {
  return (Object.values(MatchingMode) as string[]).includes(value);
}

/**
 * Reject dangerous combinations from Phase1-Project-Plan §2.7 / M2-45:
 * - Mode S + Mode C on the same path
 * - Mode C with underpay tolerance >= amountStep (would recreate collisions)
 */
export function validateMatchingSettings(
  input: MatchingSettingsInput,
): MatchingSettingsValidation {
  if (!isMatchingMode(input.mode)) {
    return {
      ok: false,
      code: "invalid_matching_mode",
      message: `unknown matching mode: ${String(input.mode)}`,
    };
  }

  const smart =
    input.mode === MatchingMode.S || input.smartAddressEnabled === true;
  const fingerprint =
    input.mode === MatchingMode.C || input.amountFingerprintEnabled === true;

  if (smart && fingerprint) {
    return {
      ok: false,
      code: "mode_s_with_mode_c",
      message:
        "Mode S (Smart address) and Mode C (Amount fingerprint) cannot be combined — both solve collision differently",
    };
  }

  if (fingerprint) {
    const tolRaw = (input.underpayTolerance ?? "0").trim();
    if (!AMOUNT_RE.test(tolRaw)) {
      return {
        ok: false,
        code: "invalid_underpay_tolerance",
        message: "underpayTolerance must be a non-negative major-unit decimal string",
      };
    }

    if (tolRaw !== "0" && !/^0(?:\.0+)?$/.test(tolRaw)) {
      const step = input.amountStep?.trim();
      const decimals = input.decimals;
      if (!step || decimals === undefined) {
        return {
          ok: false,
          code: "amount_step_required",
          message:
            "amountStep and decimals are required when Mode C underpayTolerance is non-zero",
        };
      }
      if (!AMOUNT_RE.test(step)) {
        return {
          ok: false,
          code: "invalid_amount_step",
          message: "amountStep must be a non-negative major-unit decimal string",
        };
      }

      let tolMinor: bigint;
      let stepMinor: bigint;
      try {
        tolMinor = majorToMinor(tolRaw, decimals);
        stepMinor = majorToMinor(step, decimals);
      } catch (err) {
        return {
          ok: false,
          code: "invalid_underpay_tolerance",
          message: err instanceof Error ? err.message : String(err),
        };
      }

      if (tolMinor >= stepMinor) {
        return {
          ok: false,
          code: "mode_c_underpay_too_wide",
          message:
            "Mode C underpay tolerance must be 0 or strictly less than amountStep (wide tolerance recreates collisions)",
        };
      }
    }
  }

  return { ok: true };
}

/** Throws with validation message when settings are illegal. */
export function assertMatchingSettings(input: MatchingSettingsInput): void {
  const result = validateMatchingSettings(input);
  if (!result.ok) {
    throw new Error(`${result.code}: ${result.message}`);
  }
}
