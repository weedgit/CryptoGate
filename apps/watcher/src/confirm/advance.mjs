/**
 * Confirmation advancement (M3-42) + reorg safety (M4-21).
 * verifying → completed when confirmations >= required.
 * Reorg / missing tx → payment_anomaly (never silent complete).
 */
import { OrderStatus } from "@paymentgate/domain";
import { mapPool } from "../map-pool.mjs";
import { evaluateConfirmationObservation } from "./reorg.mjs";

const DEFAULT_CONFIRM_CONCURRENCY = 8;

/**
 * Pure decision when only a confirmation count is known (unit tests / stubs).
 * Prefer evaluateConfirmationObservation when presence is available.
 * @param {{ status: string, confirmations: number, requiredConfirmations: number }} order
 * @returns {{ nextStatus: string | null, reason: string }}
 */
export function nextConfirmationStatus(order) {
  const decision = evaluateConfirmationObservation(order, {
    confirmations: order.confirmations,
    presence: "confirmed",
  });
  return { nextStatus: decision.nextStatus, reason: decision.reason };
}

/**
 * @param {{
 *   orders: Array<{
 *     orderId: string,
 *     status: string,
 *     txHash: string | null,
 *     confirmations: number,
 *     requiredConfirmations: number,
 *     network: string,
 *   }>,
 *   getConfirmations?: (args: { txHash: string, network: string }) => Promise<number>,
 *   getConfirmationState?: (args: {
 *     txHash: string,
 *     network: string,
 *   }) => Promise<{ confirmations: number, presence: string }>,
 *   apply: (args: {
 *     orderId: string,
 *     confirmations: number,
 *     nextStatus: string | null,
 *     reorg?: boolean,
 *   }) => Promise<{ updated: number, skipped?: boolean, reason?: string, alreadyCurrent?: boolean }>,
 *   concurrency?: number,
 * }} input
 */
export async function processConfirmationBatch(input) {
  const concurrency = input.concurrency ?? DEFAULT_CONFIRM_CONCURRENCY;
  return mapPool(input.orders, concurrency, async (order) => {
    if (!order.txHash) {
      return {
        orderId: order.orderId,
        skipped: true,
        reason: "missing_tx_hash",
      };
    }

    /** @type {{ confirmations: number, presence: string }} */
    let observation;
    if (input.getConfirmationState) {
      observation = await input.getConfirmationState({
        txHash: order.txHash,
        network: order.network,
      });
    } else {
      const confirmations = await input.getConfirmations({
        txHash: order.txHash,
        network: order.network,
      });
      observation = { confirmations, presence: "confirmed" };
    }

    const decision = evaluateConfirmationObservation(
      {
        status: order.status,
        confirmations: order.confirmations,
        requiredConfirmations: order.requiredConfirmations,
      },
      observation,
    );

    if (decision.skipWrite) {
      return {
        orderId: order.orderId,
        confirmations: decision.confirmations,
        nextStatus: null,
        reason: decision.reason,
        updated: 0,
        skipped: true,
        reorg: decision.reorg,
      };
    }

    const applied = await input.apply({
      orderId: order.orderId,
      confirmations: decision.confirmations,
      nextStatus: decision.nextStatus,
      reorg: decision.reorg,
    });

    return {
      orderId: order.orderId,
      confirmations: decision.confirmations,
      nextStatus: decision.nextStatus,
      reason: applied.reason ?? decision.reason,
      updated: applied.updated,
      skipped: applied.skipped === true || (applied.updated ?? 0) === 0,
      alreadyCurrent: applied.alreadyCurrent === true,
      reorg: decision.reorg,
    };
  });
}

export { evaluateConfirmationObservation, REORG_CONFIRMATION_DROP_MIN } from "./reorg.mjs";
export { OrderStatus };
