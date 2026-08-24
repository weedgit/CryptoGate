/**
 * payment_orders access for watcher match + confirmations. No apps/api imports.
 */

/** Open statuses eligible for inbound tx matching. */
export const WATCHER_MATCH_STATUSES = [
  "pending_payment",
  "verifying",
  "confirmed",
  "payment_anomaly",
];

/** Orders waiting on chain confirmations. */
export const WATCHER_CONFIRM_STATUSES = ["verifying", "confirmed"];

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
 * Apply a match result. Idempotent on (network, tx_hash) unique index.
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
      ids,
      ["pending_payment", "verifying", "payment_anomaly"],
    ],
  );

  return {
    updated: rowCount ?? 0,
    orderIds: ids,
    status: result.status,
    reason: result.reason,
  };
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
 * Persist confirmation count and optional status advance (M3-42).
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {{ orderId: string, confirmations: number, nextStatus: string | null }} input
 */
export async function applyConfirmationUpdate(db, input) {
  if (input.nextStatus) {
    const { rowCount } = await db.query(
      `UPDATE payment_orders
       SET confirmations = $1,
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
    return { updated: rowCount ?? 0 };
  }

  const { rowCount } = await db.query(
    `UPDATE payment_orders
     SET confirmations = $1,
         updated_at = now()
     WHERE id = $2::uuid
       AND status = ANY($3::text[])
       AND tx_hash IS NOT NULL`,
    [input.confirmations, input.orderId, WATCHER_CONFIRM_STATUSES],
  );
  return { updated: rowCount ?? 0 };
}
