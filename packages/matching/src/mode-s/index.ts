/**
 * Mode S — Smart address: main unless same-amount conflict, then HD pool.
 * Pool slot states FREE / IN_USE / COOLDOWN live here (not in create-order).
 * M1-32 scaffold only; implement in M2-43 / M2-44. Never hold keys / sign / sweep.
 */
import type { AssignInput, AssignResult } from "../types.js";

export async function assignModeS(_input: AssignInput): Promise<AssignResult> {
  throw new Error("assignModeS not implemented — Bruce M2-43");
}
