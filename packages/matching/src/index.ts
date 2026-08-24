/**
 * Matching package public API. Bruce owns Modes B/C/D/S.
 * Andrew calls assignOnCreate from order create; watcher calls matchTransaction.
 */
import { OrderStatus as Status } from "@cryptogate/domain";
import { assignModeB, matchModeB } from "./mode-b/index.js";
import { assignModeC, matchModeC } from "./mode-c/index.js";
import { assignModeD } from "./mode-d/index.js";
import { assignModeS } from "./mode-s/index.js";
import type { AssignInput, AssignResult, MatchInput, MatchResult } from "./types.js";

export type {
  AssignInput,
  AssignResult,
  ClaimHdPoolAddress,
  HasModeSSameAmountConflict,
  ListReservedMemoOrTags,
  ListReservedPayableAmounts,
  MatchCandidateOrder,
  MatchInput,
  MatchResult,
} from "./types.js";
export type {
  MatchingSettingsInput,
  MatchingSettingsValidation,
} from "./validate-settings.js";
export {
  assertMatchingSettings,
  validateMatchingSettings,
} from "./validate-settings.js";

/** Router selects the mode stored on the order at create time. */
export async function assignOnCreate(input: AssignInput): Promise<AssignResult> {
  switch (input.mode) {
    case "B":
      return assignModeB(input);
    case "C":
      return assignModeC(input);
    case "D":
      return assignModeD(input);
    case "S":
      return assignModeS(input);
    default: {
      const _exhaustive: never = input.mode;
      throw new Error(`Unknown matching mode: ${_exhaustive}`);
    }
  }
}

/** Watcher maps inbound tx → order status. Mode B is M3-60; C/D/S follow. */
export async function matchTransaction(input: MatchInput): Promise<MatchResult> {
  switch (input.mode) {
    case "B":
      return matchModeB(input);
    case "C":
      return matchModeC(input);
    case "D":
      return {
        status: Status.PendingPayment,
        reason: "matchTransaction Mode D — Bruce M3-62",
      };
    case "S":
      return {
        status: Status.PendingPayment,
        reason: "matchTransaction Mode S — Bruce M3-63",
      };
    default: {
      const _exhaustive: never = input.mode;
      throw new Error(`Unknown matching mode: ${_exhaustive}`);
    }
  }
}

export { assignModeB, matchModeB, majorToMinor } from "./mode-b/index.js";
export {
  assignModeC,
  matchModeC,
  formatPayableAmount,
  minorToMajor,
  pickUniquePayableMinor,
  MODE_C_RESERVED_STATUSES,
  MODE_C_MAX_FINGERPRINT_STEPS,
} from "./mode-c/index.js";
export {
  assignModeD,
  assignModeDForConfig,
  pickUniqueMemoOrTag,
  sanitizeMemoSeed,
  MODE_D_RESERVED_STATUSES,
  MODE_D_MAX_MEMO_ATTEMPTS,
  MODE_D_MAX_MEMO_LENGTH,
} from "./mode-d/index.js";
export {
  assignModeS,
  modeSAddressSource,
  MODE_S_CONFLICT_STATUSES,
} from "./mode-s/index.js";
