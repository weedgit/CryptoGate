/**
 * Restart / replay safety (M4-20).
 * Pure decisions — DB apply uses these so duplicate ticks never rewrite status.
 * No apps/api imports.
 */

/** Terminal statuses watcher must never rewrite (except late-pay expired → anomaly). */
export const WATCHER_TERMINAL_STATUSES = [
  "completed",
  "cancelled",
  "failed",
];

/** Statuses match apply may transition from (incl. expired for late payment). */
export const WATCHER_MATCH_APPLY_STATUSES = [
  "pending_payment",
  "verifying",
  "payment_anomaly",
  "expired",
];

/**
 * @param {{
 *   status: string,
 *   txHash?: string | null,
 *   receivedAmount?: string | null,
 * }} row
 * @param {{ status: string }} result
 * @param {{ txHash: string, amount: string }} transfer
 * @returns {{ write: boolean, reason: string }}
 */
export function matchWriteNeeded(row, result, transfer) {
  if (WATCHER_TERMINAL_STATUSES.includes(row.status)) {
    return { write: false, reason: "terminal_order" };
  }
  if (!WATCHER_MATCH_APPLY_STATUSES.includes(row.status)) {
    return { write: false, reason: "status_not_matchable" };
  }

  // Late payment after API expiry → anomaly (M3-43).
  if (row.status === "expired" && result.status !== "payment_anomaly") {
    return { write: false, reason: "expired_not_anomaly" };
  }

  const existingTx = row.txHash?.trim() || "";
  const txHash = transfer.txHash.trim();
  if (existingTx && existingTx !== txHash) {
    return { write: false, reason: "tx_hash_conflict" };
  }

  const sameStatus = row.status === result.status;
  const sameTx = existingTx === txHash;
  const sameAmount =
    (row.receivedAmount ?? "").trim() === transfer.amount.trim();
  const missingReceived = !(row.receivedAmount ?? "").trim();

  if (sameStatus && sameTx) {
    // Allow rewrite to fill received_amount when verifying amount drifted,
    // or when anomaly/verifying rows never persisted the inbound amount.
    if (result.status === "verifying" && !sameAmount) {
      return { write: true, reason: "apply" };
    }
    if (missingReceived && transfer.amount.trim()) {
      return { write: true, reason: "backfill_received_amount" };
    }
    return { write: false, reason: "already_applied" };
  }

  return { write: true, reason: "apply" };
}

/**
 * Skip no-op UPDATEs that only bump updated_at.
 * Normal path never decreases confirmations; reorg (M4-21) may rewind + anomaly.
 *
 * @param {{ status: string, confirmations: number }} row
 * @param {number} confirmations
 * @param {string | null} nextStatus
 * @param {{ reorg?: boolean }} [opts]
 * @returns {{ write: boolean, reason: string }}
 */
export function confirmationWriteNeeded(row, confirmations, nextStatus, opts = {}) {
  if (WATCHER_TERMINAL_STATUSES.includes(row.status) || row.status === "expired") {
    return { write: false, reason: "terminal_order" };
  }
  if (row.status !== "verifying" && row.status !== "confirmed") {
    return { write: false, reason: "not_in_confirmation_path" };
  }

  const current = Number(row.confirmations) || 0;
  const next = Number(confirmations) || 0;

  if (opts.reorg && nextStatus === "payment_anomaly") {
    return { write: true, reason: "reorg_anomaly" };
  }

  if (nextStatus && nextStatus !== row.status) {
    if (next < current) {
      return { write: false, reason: "confirmations_would_decrease" };
    }
    return { write: true, reason: "status_advance" };
  }

  if (next > current) {
    return { write: true, reason: "confirmations_increased" };
  }

  return { write: false, reason: "already_current" };
}
