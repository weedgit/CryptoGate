import {
  assignOnCreate,
  MODE_C_RESERVED_STATUSES,
  MODE_D_RESERVED_STATUSES,
  MODE_S_CONFLICT_STATUSES,
} from "@cryptogate/matching";
import { findSettlementAddress } from "../settlement/settlement-store.mjs";
import { mapAssignError } from "./order-assign.mjs";
import {
  hasModeSSameAmountConflict,
  listReservedMemoOrTags,
  listReservedPayableAmounts,
} from "./order-store.mjs";

/**
 * Call matching under an open create-order transaction (advisory lock held).
 * Mode S without xPub falls back to main address (matching contract).
 *
 * @param {{
 *   client: import("pg").PoolClient,
 *   orgId: string,
 *   matchingMode: string,
 *   asset: string,
 *   network: string,
 *   amount: string,
 *   idempotencyKey: string,
 *   requiredConfirmations: number,
 * }} input
 */
export async function assignOnOrderCreate(input) {
  const settlement = await findSettlementAddress(
    input.orgId,
    input.asset,
    input.network,
    input.client,
  );
  if (!settlement?.address) {
    return {
      ok: false,
      status: 422,
      code: "settlement_address_required",
      message: "Configure a settlement address for this asset and network",
    };
  }

  const mainSettlementAddress = settlement.address;
  /** @type {import("@cryptogate/matching").ListReservedPayableAmounts} */
  const listPayables = (query) =>
    listReservedPayableAmounts(input.client, {
      ...query,
      statuses: MODE_C_RESERVED_STATUSES,
    });
  /** @type {import("@cryptogate/matching").ListReservedMemoOrTags} */
  const listMemos = (query) =>
    listReservedMemoOrTags(input.client, {
      ...query,
      statuses: MODE_D_RESERVED_STATUSES,
    });
  /** @type {import("@cryptogate/matching").HasModeSSameAmountConflict} */
  const hasConflict = (query) =>
    hasModeSSameAmountConflict(input.client, {
      ...query,
      statuses: MODE_S_CONFLICT_STATUSES,
    });

  try {
    const result = await assignOnCreate({
      mode: input.matchingMode,
      merchantId: input.orgId,
      asset: input.asset,
      network: input.network,
      requestedAmount: input.amount,
      mainSettlementAddress,
      listReservedPayableAmounts: listPayables,
      listReservedMemoOrTags: listMemos,
      memoSeed: input.idempotencyKey,
      // xPub / HD pool registration is M2-20 / M2-44 — Mode S uses main until then.
      xPubConfigured: false,
      hasModeSSameAmountConflict: hasConflict,
    });

    return {
      ok: true,
      assign: {
        matchingMode: input.matchingMode,
        payableAmount: result.payableAmount,
        receiveAddress: result.receiveAddress,
        addressSource: result.addressSource,
        hdIndex: result.hdIndex,
        memoOrTag: result.memoOrTag,
        requiredConfirmations: input.requiredConfirmations,
      },
    };
  } catch (err) {
    return { ok: false, ...mapAssignError(err) };
  }
}
