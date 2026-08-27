import {
  assignOnCreate,
  MODE_C_RESERVED_STATUSES,
  MODE_D_RESERVED_STATUSES,
  MODE_S_CONFLICT_STATUSES,
} from "@cryptogate/matching";
import { findSettlementAddress } from "../settlement/settlement-store.mjs";
import { hasActiveXpub } from "../xpub/xpub-store.mjs";
import { claimHdPoolAddress } from "../mode-s/hd-pool-store.mjs";
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
 *   settlementOrgId?: string,
 *   xpubOrgId?: string,
 *   walletGroupOrgIds?: string[],
 *   matchingMode: string,
 *   asset: string,
 *   network: string,
 *   amount: string,
 *   idempotencyKey: string,
 *   requiredConfirmations: number,
 * }} input
 */
export async function assignOnOrderCreate(input) {
  const settlementOrgId = input.settlementOrgId ?? input.orgId;
  const xpubOrgId = input.xpubOrgId ?? input.orgId;
  const walletGroupOrgIds = input.walletGroupOrgIds ?? [settlementOrgId];

  const settlement = await findSettlementAddress(
    settlementOrgId,
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
  const xPubConfigured = await hasActiveXpub(
    xpubOrgId,
    input.asset,
    input.network,
    input.client,
  );
  /** @type {import("@cryptogate/matching").ListReservedPayableAmounts} */
  const listPayables = (query) =>
    listReservedPayableAmounts(input.client, {
      ...query,
      merchantIds: walletGroupOrgIds,
      statuses: MODE_C_RESERVED_STATUSES,
    });
  /** @type {import("@cryptogate/matching").ListReservedMemoOrTags} */
  const listMemos = (query) =>
    listReservedMemoOrTags(input.client, {
      ...query,
      merchantIds: walletGroupOrgIds,
      statuses: MODE_D_RESERVED_STATUSES,
    });
  /** @type {import("@cryptogate/matching").HasModeSSameAmountConflict} */
  const hasConflict = (query) =>
    hasModeSSameAmountConflict(input.client, {
      ...query,
      merchantIds: walletGroupOrgIds,
      statuses: MODE_S_CONFLICT_STATUSES,
    });

  try {
    const result = await assignOnCreate({
      mode: input.matchingMode,
      merchantId: xpubOrgId,
      asset: input.asset,
      network: input.network,
      requestedAmount: input.amount,
      mainSettlementAddress,
      listReservedPayableAmounts: listPayables,
      listReservedMemoOrTags: listMemos,
      memoSeed: input.idempotencyKey,
      xPubConfigured,
      hasModeSSameAmountConflict: hasConflict,
      claimHdPoolAddress: (query) =>
        claimHdPoolAddress(input.client, {
          ...query,
          mainSettlementAddress,
        }),
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
