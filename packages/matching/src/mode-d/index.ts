/**
 * Mode D — memo / destination tag (network-limited).
 * M1-32 scaffold only; implement in M2-42. Hide on unsupported USDT nets in UI/API.
 */
import type { AssignInput, AssignResult } from "../types.js";

export async function assignModeD(_input: AssignInput): Promise<AssignResult> {
  throw new Error("assignModeD not implemented — Bruce M2-42");
}
