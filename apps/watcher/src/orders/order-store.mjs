/**
 * payment_orders access for watcher match + confirmations. No apps/api imports.
 * M4-20: apply paths are restart-safe (no duplicate status rewrites).
 */

import {
  confirmationWriteNeeded,
  matchWriteNeeded,
  WATCHER_MATCH_APPLY_STATUSES,
  WATCHER_TERMINAL_STATUSES,
} from "./restart-safety.mjs";

/** Open statuses eligible for inbound tx matching. */
export const WATCHER_MATCH_STATUSES = [
  "pending_payment",
  "verifying",
  "confirmed",
  "payment_anomaly",
];

/** Orders waiting on chain confirmations. */
export const WATCHER_CONFIRM_STATUSES = ["verifying", "confirmed"];

export {
  confirmationWriteNeeded,
  matchWriteNeeded,
  WATCHER_MATCH_APPLY_STATUSES,
  WATCHER_TERMINAL_STATUSES,
};

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {{ asset: string, network: string }} filter
 */
export async function listOpenOrdersForMatch(db, filter) {
  const { rows } = await db.query(
    `SELECT id, matching_mode, payable_amount, receive_address, asset, network,
            memo_or_tag, expires_at, status, required_confirmations
     FROM payment_orders
     WHERE asset = $1
       AND network = $2
       AND status = ANY($3::text[])
     ORDER BY created_at ASC`,
    [filter.asset, filter.network, WATCHER_MATCH_STATUSES],
  );
  return rows.map((row) => ({
    orderId: row.id,
    matchingMode: row.matching_mode,
    payableAmount: row.payable_amount,
    receiveAddress: row.receive_address,
    asset: row.asset,
    network: row.network,
    memoOrTag: row.memo_or_tag,
    expiresAt:
      row.expires_at instanceof Date
        ? row.expires_at.toISOString()
        : row.expires_at,
    status: row.status,
    requiredConfirmations: row.required_confirmations,
  }));
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {{ asset: string, network: string }} filter
 */
export async function listOrdersAwaitingConfirmations(db, filter) {
  const { rows } = await db.query(
    `SELECT id, status, tx_hash, confirmations, required_confirmations, network
     FROM payment_orders
     WHERE asset = $1
       AND network = $2
       AND status = ANY($3::text[])
       AND tx_hash IS NOT NULL
     ORDER BY updated_at ASC`,
    [filter.asset, filter.network, WATCHER_CONFIRM_STATUSES],
  );
  return rows.map((row) => ({
    orderId: row.id,
    status: row.status,
    txHash: row.tx_hash,
    confirmations: row.confirmations ?? 0,
    requiredConfirmations: row.required_confirmations,
    network: row.network,
  }));
}

/**
 * Apply a match result. Idempotent on (network, tx_hash) and already-applied rows.
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {{
 *   result: { orderId?: string, orderIds?: string[], status: string, reason?: string },
 *   transfer: { txHash: string, amount: string, network: string },
 * }} input
 */
export async function applyMatchResult(db, input) {
  const { result, transfer } = input;
  const ids =
    result.orderIds?.length > 0
      ? result.orderIds
      : result.orderId
        ? [result.orderId]
        : [];

  if (ids.length === 0) {
    return { updated: 0, skipped: true, reason: result.reason ?? "no_order" };
  }

  const { rows } = await db.query(
    `SELECT id, status, tx_hash, received_amount::text AS received_amount
     FROM payment_orders
     WHERE id = ANY($1::uuid[])`,
    [ids],
  );

  const toWrite = [];
  /** @type {string[]} */
  const skipReasons = [];
  for (const row of rows) {
    const decision = matchWriteNeeded(
      {
        status: row.status,
        txHash: row.tx_hash,
        receivedAmount: row.received_amount,
      },
      { status: result.status },
      { txHash: transfer.txHash, amount: transfer.amount },
    );
    if (decision.write) toWrite.push(row.id);
    else skipReasons.push(decision.reason);
  }

  if (toWrite.length === 0) {
    return {
      updated: 0,
      skipped: true,
      alreadyApplied: skipReasons.includes("already_applied"),
      reason: skipReasons[0] ?? "already_applied",
      orderIds: ids,
      status: result.status,
    };
  }

  try {
    const { rowCount } = await db.query(
      `UPDATE payment_orders
       SET status = $1,
           received_amount = CASE
             WHEN $1 = 'verifying' THEN $2
             ELSE received_amount
           END,
           tx_hash = CASE
             WHEN $1 = 'verifying' THEN $3
             WHEN tx_hash IS NULL AND $1 = 'payment_anomaly' THEN $3
             ELSE tx_hash
           END,
           updated_at = now()
       WHERE id = ANY($4::uuid[])
         AND status = ANY($5::text[])
         AND (tx_hash IS NULL OR tx_hash = $3)`,
      [
        result.status,
        transfer.amount,
        transfer.txHash,
        toWrite,
        WATCHER_MATCH_APPLY_STATUSES,
      ],
    );

    return {
      updated: rowCount ?? 0,
      orderIds: ids,
      status: result.status,
      reason: result.reason,
      skipped: (rowCount ?? 0) === 0,
      alreadyApplied: (rowCount ?? 0) === 0,
    };
  } catch (err) {
    // Unique (network, tx_hash) — concurrent/restart race already bound this hash.
    if (err && (err.code === "23505" || /payment_orders_network_tx_hash/i.test(String(err.message)))) {
      return {
        updated: 0,
        skipped: true,
        alreadyApplied: true,
        reason: "tx_hash_unique_conflict",
        orderIds: ids,
        status: result.status,
      };
    }
    throw err;
  }
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {{ network: string, txHashes: string[] }} input
 * @returns {Promise<Set<string>>}
 */
export async function listKnownTxHashes(db, input) {
  if (!input.txHashes.length) return new Set();
  const { rows } = await db.query(
    `SELECT tx_hash
     FROM payment_orders
     WHERE network = $1
       AND tx_hash = ANY($2::text[])`,
    [input.network, input.txHashes],
  );
  return new Set(rows.map((r) => r.tx_hash).filter(Boolean));
}

/**
 * Persist confirmation count and optional status advance (M3-42 / M4-20 / M4-21).
 * Skips no-ops; never decreases confirmations unless reorg → payment_anomaly.
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {{
 *   orderId: string,
 *   confirmations: number,
 *   nextStatus: string | null,
 *   reorg?: boolean,
 * }} input
 */
export async function applyConfirmationUpdate(db, input) {
  const { rows } = await db.query(
    `SELECT id, status, confirmations
     FROM payment_orders
     WHERE id = $1::uuid`,
    [input.orderId],
  );
  const row = rows[0];
  if (!row) {
    return { updated: 0, skipped: true, reason: "order_not_found" };
  }

  const decision = confirmationWriteNeeded(
    { status: row.status, confirmations: row.confirmations ?? 0 },
    input.confirmations,
    input.nextStatus,
    { reorg: input.reorg === true },
  );
  if (!decision.write) {
    return {
      updated: 0,
      skipped: true,
      alreadyCurrent: true,
      reason: decision.reason,
    };
  }

  if (input.reorg && input.nextStatus === "payment_anomaly") {
    const { rowCount } = await db.query(
      `UPDATE payment_orders
       SET confirmations = $1,
           status = 'payment_anomaly',
           updated_at = now()
       WHERE id = $2::uuid
         AND status = ANY($3::text[])
         AND tx_hash IS NOT NULL`,
      [input.confirmations, input.orderId, WATCHER_CONFIRM_STATUSES],
    );
    return {
      updated: rowCount ?? 0,
      skipped: (rowCount ?? 0) === 0,
      reason: decision.reason,
      reorg: true,
    };
  }

  if (input.nextStatus) {
    const { rowCount } = await db.query(
      `UPDATE payment_orders
       SET confirmations = GREATEST(confirmations, $1),
           status = $2,
           updated_at = now()
       WHERE id = $3::uuid
         AND status = ANY($4::text[])
         AND tx_hash IS NOT NULL`,
      [
        input.confirmations,
        input.nextStatus,
        input.orderId,
        WATCHER_CONFIRM_STATUSES,
      ],
    );
    return {
      updated: rowCount ?? 0,
      skipped: (rowCount ?? 0) === 0,
      reason: decision.reason,
    };
  }

  const { rowCount } = await db.query(
    `UPDATE payment_orders
     SET confirmations = GREATEST(confirmations, $1),
         updated_at = now()
     WHERE id = $2::uuid
       AND status = ANY($3::text[])
       AND tx_hash IS NOT NULL
       AND confirmations < $1`,
    [input.confirmations, input.orderId, WATCHER_CONFIRM_STATUSES],
  );
  return {
    updated: rowCount ?? 0,
    skipped: (rowCount ?? 0) === 0,
    reason: decision.reason,
  };
}
