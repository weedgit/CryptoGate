import {
  assignOnCreate,
  MODE_B_CREATE_BLOCK_STATUSES,
  MODE_C_RESERVED_STATUSES,
  MODE_D_CREATE_BLOCK_STATUSES,
  MODE_D_RESERVED_STATUSES,
  MODE_S_CONFLICT_STATUSES,
} from "@cryptogate/matching";
import { findSettlementAddress } from "../settlement/settlement-store.mjs";
import { hasActiveXpub } from "../xpub/xpub-store.mjs";
import { claimHdPoolAddress } from "../mode-s/hd-pool-store.mjs";
import { mapAssignError } from "./order-assign.mjs";
import {
  findModeBSameAmountCreateConflict,
  findModeDSameMemoCreateConflict,
  hasModeSSameAmountConflict,
  listReservedMemoOrTags,
  listReservedPayableAmounts,
} from "./order-store.mjs";

/**
 * @param {{
 *   id: string,
 *   orderNumber: string,
 *   status: string,
 *   payableAmount: string,
 *   asset: string,
 *   network: string,
 *   createdAt?: string,
 *   createdByEmail?: string | null,
 *   memoOrTag?: string | null,
 * }} blocking
 * @param {"mode_b_amount_in_use" | "mode_d_memo_in_use"} code
 * @param {string} message
 */
function blockingCreateError(blocking, code, message) {
  const who = blocking.createdByEmail?.trim() || "another cashier";
  return {
    ok: false,
    status: 409,
    code,
    message,
    details: {
      blockingOrder: {
        id: blocking.id,
        orderNumber: blocking.orderNumber,
        status: blocking.status,
        payableAmount: blocking.payableAmount,
        asset: blocking.asset,
        network: blocking.network,
        createdAt: blocking.createdAt,
        createdByEmail: blocking.createdByEmail,
        createdByLabel: who,
        ...(blocking.memoOrTag ? { memoOrTag: blocking.memoOrTag } : {}),
      },
    },
  };
}

/**
 * Call matching under an open create-order transaction (advisory lock held).
 * Mode S without xPub falls back to main address (matching contract).
 * Mode B: hard-block second same-amount open order on the main address.
 * Mode D: hard-block if assigned memo is already held by an open order.
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

  if (input.matchingMode === "B") {
    const blocking = await findModeBSameAmountCreateConflict(input.client, {
      merchantId: input.orgId,
      merchantIds: walletGroupOrgIds,
      asset: input.asset,
      network: input.network,
      receiveAddress: mainSettlementAddress,
      payableAmount: input.amount.trim(),
      statuses: MODE_B_CREATE_BLOCK_STATUSES,
    });
    if (blocking) {
      return blockingCreateError(
        blocking,
        "mode_b_amount_in_use",
        `Another open order for ${blocking.payableAmount} ${blocking.asset} uses this address. ` +
          `Same on-chain payment can't be auto-matched — cancel one, change amount, or ask Owner to use Amount fingerprint / Smart address.`,
      );
    }
  }

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

    if (input.matchingMode === "D" && result.memoOrTag) {
      const memoBlocking = await findModeDSameMemoCreateConflict(input.client, {
        merchantId: input.orgId,
        merchantIds: walletGroupOrgIds,
        asset: input.asset,
        network: input.network,
        receiveAddress: result.receiveAddress,
        memoOrTag: result.memoOrTag,
        statuses: MODE_D_CREATE_BLOCK_STATUSES,
      });
      if (memoBlocking) {
        return blockingCreateError(
          memoBlocking,
          "mode_d_memo_in_use",
          `Another open order already uses memo/tag ${memoBlocking.memoOrTag}. ` +
            `Cancel that order or wait until it finishes before creating another.`,
        );
      }
    }

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
