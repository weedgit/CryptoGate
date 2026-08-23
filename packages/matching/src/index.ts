/**
 * Matching package public API (Sprint 0 stubs). Bruce implements Modes B/C/D/S.
 * Andrew calls assignOnCreate from order create; watcher calls matchTransaction.
 */
import { OrderStatus as Status } from "@cryptogate/domain";
import { assignModeB } from "./mode-b/index.js";
import type { AssignInput, AssignResult, MatchInput, MatchResult } from "./types.js";

export type {
  AssignInput,
  AssignResult,
  MatchInput,
  MatchResult,
} from "./types.js";

/** Router selects the mode stored on the order. */
export async function assignOnCreate(input: AssignInput): Promise<AssignResult> {
  switch (input.mode) {
    case "B":
      return assignModeB(input);
    case "C":
    case "D":
    case "S":
      throw new Error(`assignOnCreate mode ${input.mode} not implemented — Bruce`);
    default: {
      const _exhaustive: never = input.mode;
      throw new Error(`Unknown matching mode: ${_exhaustive}`);
    }
  }
}

export async function matchTransaction(_input: MatchInput): Promise<MatchResult> {
  return {
    status: Status.PendingPayment,
    reason: "matchTransaction stub — Bruce implements in M3",
  };
}

export { assignModeB };
