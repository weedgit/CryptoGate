/**
 * Reorg / rollback detection for confirmation path (M4-21).
 * Pure decisions — never mark completed when the chain view regresses.
 */

import { OrderStatus } from "@paymentgate/domain";

/** Drop of this many confirmations while tx still present → anomaly. */
export const REORG_CONFIRMATION_DROP_MIN = 3;
/**
 * Consecutive "tx missing" answers before acting. One empty receipt from a lagging or
 * load-balanced node used to flip a paid order to anomaly for good (review M7).
 */
export const MISSING_OBSERVATIONS_FOR_REORG = 3;
/** A matched tx never seen in a block for this long was dropped from the mempool (M7). */
export const DROPPED_TX_AFTER_MS = 30 * 60 * 1000;

/**
 * @param {{
 *   status: string,
 *   confirmations: number,
 *   requiredConfirmations: number,
 * }} order
 * @param {{
 *   confirmations: number,
 *   presence: 'confirmed' | 'missing' | 'unknown' | 'failed',
 *   failureReason?: string,
 *   missingCount?: number,
 *   missingForMs?: number,
 * }} observation
 * @returns {{
 *   nextStatus: string | null,
 *   confirmations: number,
 *   reason: string,
 *   skipWrite: boolean,
 *   reorg: boolean,
 * }}
 */
export function evaluateConfirmationObservation(order, observation) {
  if (
    order.status !== OrderStatus.Verifying &&
    order.status !== OrderStatus.Confirmed
  ) {
    return {
      nextStatus: null,
      confirmations: order.confirmations,
      reason: "not_in_confirmation_path",
      skipWrite: true,
      reorg: false,
    };
  }

  const stored = Number(order.confirmations) || 0;
  const chain = Number(observation.confirmations) || 0;
  const presence = observation.presence ?? "unknown";

  // RPC / tip failure: do not rewind or complete.
  if (presence === "unknown") {
    return {
      nextStatus: null,
      confirmations: stored,
      reason: "rpc_unknown",
      skipWrite: true,
      reorg: false,
    };
  }

  // Mined but reverted, or not the transfer we matched: never complete.
  if (presence === "failed") {
    return {
      nextStatus: OrderStatus.PaymentAnomaly,
      confirmations: 0,
      reason: observation.failureReason ?? "tx_failed",
      skipWrite: false,
      reorg: true,
    };
  }

  // Tx disappeared after we already saw confirmations (reorg / rollback).
  if (presence === "missing") {
    const missingCount = Number(observation.missingCount ?? MISSING_OBSERVATIONS_FOR_REORG);
    const confirmedMissing = missingCount >= MISSING_OBSERVATIONS_FOR_REORG;
    if (stored >= 1 && confirmedMissing) {
      return {
        nextStatus: OrderStatus.PaymentAnomaly,
        confirmations: 0,
        reason: "tx_missing_reorg",
        skipWrite: false,
        reorg: true,
      };
    }
    if (
      stored === 0 &&
      confirmedMissing &&
      Number(observation.missingForMs ?? 0) >= DROPPED_TX_AFTER_MS
    ) {
      return {
        nextStatus: OrderStatus.PaymentAnomaly,
        confirmations: 0,
        reason: "tx_dropped",
        skipWrite: false,
        reorg: true,
      };
    }
    // Just matched (indexers lag) or a single empty answer: look again next tick.
    return {
      nextStatus: null,
      confirmations: stored,
      reason: stored >= 1 ? "tx_missing_recheck" : "tx_not_indexed_yet",
      skipWrite: true,
      reorg: false,
    };
  }

  // Present but confirmations fell sharply vs stored (deep reorg).
  if (stored - chain >= REORG_CONFIRMATION_DROP_MIN) {
    return {
      nextStatus: OrderStatus.PaymentAnomaly,
      confirmations: chain,
      reason: "confirmations_dropped_reorg",
      skipWrite: false,
      reorg: true,
    };
  }

  const required = Number(order.requiredConfirmations) || 0;
  if (chain < required) {
    return {
      nextStatus: null,
      confirmations: chain,
      reason: "awaiting_confirmations",
      skipWrite: false,
      reorg: false,
    };
  }

  return {
    nextStatus: OrderStatus.Completed,
    confirmations: chain,
    reason: "confirmations_met",
    skipWrite: false,
    reorg: false,
  };
}
