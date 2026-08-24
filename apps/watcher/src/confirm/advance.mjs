/**
 * Confirmation advancement (M3-42).
 * verifying → confirmed → completed when confirmations >= required.
 * Phase 1 may complete in one step once required confirmations are met.
 */
import { OrderStatus } from "@cryptogate/domain";

/**
 * Pure decision: given current confirmations vs required, next status.
 * @param {{ status: string, confirmations: number, requiredConfirmations: number }} order
 * @returns {{ nextStatus: string | null, reason: string }}
 */
export function nextConfirmationStatus(order) {
  if (order.status !== OrderStatus.Verifying && order.status !== OrderStatus.Confirmed) {
    return { nextStatus: null, reason: "not_in_confirmation_path" };
  }

  const conf = Number(order.confirmations) || 0;
  const required = Number(order.requiredConfirmations) || 0;

  if (conf < required) {
    return { nextStatus: null, reason: "awaiting_confirmations" };
  }

  // Phase 1: once required confirmations are reached, complete in one step.
  if (
    order.status === OrderStatus.Verifying ||
    order.status === OrderStatus.Confirmed
  ) {
    return { nextStatus: OrderStatus.Completed, reason: "confirmations_met" };
  }

  return { nextStatus: null, reason: "no_transition" };
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
 *   getConfirmations: (args: { txHash: string, network: string }) => Promise<number>,
 *   apply: (args: {
 *     orderId: string,
 *     confirmations: number,
 *     nextStatus: string | null,
 *   }) => Promise<{ updated: number }>,
 * }} input
 */
export async function processConfirmationBatch(input) {
  const outcomes = [];
  for (const order of input.orders) {
    if (!order.txHash) {
      outcomes.push({
        orderId: order.orderId,
        skipped: true,
        reason: "missing_tx_hash",
      });
      continue;
    }

    const confirmations = await input.getConfirmations({
      txHash: order.txHash,
      network: order.network,
    });

    const decision = nextConfirmationStatus({
      status: order.status,
      confirmations,
      requiredConfirmations: order.requiredConfirmations,
    });

    const applied = await input.apply({
      orderId: order.orderId,
      confirmations,
      nextStatus: decision.nextStatus,
    });

    outcomes.push({
      orderId: order.orderId,
      confirmations,
      nextStatus: decision.nextStatus,
      reason: applied.reason ?? decision.reason,
      updated: applied.updated,
      skipped: applied.skipped === true || (applied.updated ?? 0) === 0,
      alreadyCurrent: applied.alreadyCurrent === true,
    });
  }
  return outcomes;
}
