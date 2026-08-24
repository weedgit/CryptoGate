/**
 * Reorg / rollback detection for confirmation path (M4-21).
 * Pure decisions — never mark completed when the chain view regresses.
 */

import { OrderStatus } from "@cryptogate/domain";

/** Drop of this many confirmations while tx still present → anomaly. */
export const REORG_CONFIRMATION_DROP_MIN = 3;

/**
 * @param {{
 *   status: string,
 *   confirmations: number,
 *   requiredConfirmations: number,
 * }} order
 * @param {{
 *   confirmations: number,
 *   presence: 'confirmed' | 'missing' | 'unknown',
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

  // Tx disappeared after we already saw confirmations (reorg / rollback).
  if (presence === "missing") {
    if (stored >= 1) {
      return {
        nextStatus: OrderStatus.PaymentAnomaly,
        confirmations: 0,
        reason: "tx_missing_reorg",
        skipWrite: false,
        reorg: true,
      };
    }
    // Just matched; TronGrid may lag — wait.
    return {
      nextStatus: null,
      confirmations: stored,
      reason: "tx_not_indexed_yet",
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
