/**
 * Mode B stub — fixed settlement address assign.
 * Bruce owns implementation.
 */
import type { AssetCode, AddressSource } from "@cryptogate/domain";
import type { AssignInput, AssignResult } from "../types.js";

export async function assignModeB(input: AssignInput): Promise<AssignResult> {
  return {
    payableAmount: {
      amount: input.requestedAmount,
      currency: input.asset as AssetCode,
    },
    receiveAddress: input.mainSettlementAddress,
    addressSource: "main" satisfies AddressSource,
  };
}
