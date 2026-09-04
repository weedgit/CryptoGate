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

/** Recently expired — still candidates for late_payment_after_expiry (M3-43). */
export const WATCHER_LATE_PAYMENT_STATUSES = ["expired"];

/** Default lookback for late payment after expiry. */
export const LATE_PAYMENT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/** Orders waiting on chain confirmations. */
export const WATCHER_CONFIRM_STATUSES = ["verifying", "confirmed"];

export {
  confirmationWriteNeeded,
  matchWriteNeeded,
  WATCHER_MATCH_APPLY_STATUSES,
  WATCHER_TERMINAL_STATUSES,
};

/**
 * Distinct asset+network scopes that currently need match or confirmation work.
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {{ now?: Date, lateLookbackMs?: number }} [opts]
 * @returns {Promise<Array<{ asset: string, network: string }>>}
 */
export async function listDistinctWatchScopes(db, opts = {}) {
  const now = opts.now ?? new Date();
  const lookbackMs = opts.lateLookbackMs ?? LATE_PAYMENT_LOOKBACK_MS;
  const expiredAfter = new Date(now.getTime() - lookbackMs);

  const { rows } = await db.query(
    `SELECT DISTINCT asset, network
     FROM payment_orders
     WHERE (
         status = ANY($1::text[])
         OR (
           status = ANY($2::text[])
           AND expires_at >= $3::timestamptz
         )
         OR (
           status = ANY($4::text[])
           AND tx_hash IS NOT NULL
         )
       )
     ORDER BY network ASC, asset ASC`,
    [
      WATCHER_MATCH_STATUSES,
      WATCHER_LATE_PAYMENT_STATUSES,
      expiredAfter.toISOString(),
      WATCHER_CONFIRM_STATUSES,
    ],
  );
  return rows.map((row) => ({
    asset: row.asset,
    network: row.network,
  }));
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {{ asset: string, network: string, now?: Date, lateLookbackMs?: number }} filter
 */
export async function listOpenOrdersForMatch(db, filter) {
  const now = filter.now ?? new Date();
  const lookbackMs = filter.lateLookbackMs ?? LATE_PAYMENT_LOOKBACK_MS;
  const expiredAfter = new Date(now.getTime() - lookbackMs);

  const { rows } = await db.query(
    `SELECT id, matching_mode, payable_amount, receive_address, asset, network,
            memo_or_tag, expires_at, status, required_confirmations,
            COALESCE(underpay_tolerance, '0') AS underpay_tolerance,
            created_at
     FROM payment_orders
     WHERE asset = $1
       AND network = $2
       AND (
         status = ANY($3::text[])
         OR (
           status = ANY($4::text[])
           AND expires_at >= $5::timestamptz
         )
       )
     ORDER BY created_at ASC`,
    [
      filter.asset,
      filter.network,
      WATCHER_MATCH_STATUSES,
      WATCHER_LATE_PAYMENT_STATUSES,
      expiredAfter.toISOString(),
    ],
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
    underpayTolerance: row.underpay_tolerance ?? "0",
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  }));
}

/**
 * Same-address orders on any network (M3-44 wrong-network / wrong-asset).
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {{ addresses: string[], now?: Date, lateLookbackMs?: number }} filter
 */
export async function listOrdersByReceiveAddresses(db, filter) {
  const addresses = [...new Set(filter.addresses.map((a) => a.trim()).filter(Boolean))];
  if (addresses.length === 0) return [];

  const now = filter.now ?? new Date();
  const lookbackMs = filter.lateLookbackMs ?? LATE_PAYMENT_LOOKBACK_MS;
  const expiredAfter = new Date(now.getTime() - lookbackMs);

  const { rows } = await db.query(
    `SELECT id, matching_mode, payable_amount, receive_address, asset, network,
            memo_or_tag, expires_at, status, required_confirmations, created_at
     FROM payment_orders
     WHERE receive_address = ANY($1::text[])
       AND (
         status = ANY($2::text[])
         OR (
           status = ANY($3::text[])
           AND expires_at >= $4::timestamptz
         )
       )
     ORDER BY created_at ASC`,
    [
      addresses,
      WATCHER_MATCH_STATUSES,
      WATCHER_LATE_PAYMENT_STATUSES,
      expiredAfter.toISOString(),
    ],
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
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
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
    asset: filter.asset,
  }));
}

/**
 * All orders waiting on confirmations — fast path before heavy ingest scopes.
 * @param {import("pg").Pool | import("pg").PoolClient} db
 */
export async function listAllOrdersAwaitingConfirmations(db) {
  const { rows } = await db.query(
    `SELECT id, status, tx_hash, confirmations, required_confirmations, network, asset
     FROM payment_orders
     WHERE status = ANY($1::text[])
       AND tx_hash IS NOT NULL
     ORDER BY updated_at ASC`,
    [WATCHER_CONFIRM_STATUSES],
  );
  return rows.map((row) => ({
    orderId: row.id,
    status: row.status,
    txHash: row.tx_hash,
    confirmations: row.confirmations ?? 0,
    requiredConfirmations: row.required_confirmations,
    network: row.network,
    asset: row.asset,
  }));
}

/**
 * Apply a match result. Idempotent on (network, tx_hash) and already-applied rows.
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {{
 *   result: { orderId?: string, orderIds?: string[], status: string, reason?: string },
 *   transfer: { txHash: string, amount: string, network: string, fromAddress?: string },
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
  const fromAddress =
    typeof transfer.fromAddress === "string" && transfer.fromAddress.trim()
      ? transfer.fromAddress.trim()
      : null;

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
           anomaly_reason = CASE
             WHEN $1 = 'payment_anomaly' THEN $6
             ELSE NULL
           END,
           received_amount = CASE
             WHEN $1 IN ('verifying', 'payment_anomaly') THEN $2
             ELSE received_amount
           END,
           tx_hash = CASE
             WHEN $1 = 'verifying' THEN $3
             WHEN tx_hash IS NULL AND $1 = 'payment_anomaly' THEN $3
             ELSE tx_hash
           END,
           from_address = CASE
             WHEN $7::text IS NULL THEN from_address
             WHEN from_address IS NULL THEN $7
             WHEN $1 = 'verifying' THEN $7
             ELSE from_address
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
        result.reason ?? null,
        fromAddress,
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
           anomaly_reason = COALESCE($4, anomaly_reason),
           updated_at = now()
       WHERE id = $2::uuid
         AND status = ANY($3::text[])
         AND tx_hash IS NOT NULL`,
      [
        input.confirmations,
        input.orderId,
        WATCHER_CONFIRM_STATUSES,
        decision.reason ?? "reorg",
      ],
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
           confirmed_at = CASE
             WHEN $2 IN ('completed', 'confirmed')
               THEN COALESCE(confirmed_at, now())
             ELSE confirmed_at
           END,
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

/**
 * Fill missing payer address when the same tx is seen again on poll
 * (e.g. orders matched before from_address was persisted).
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {{
 *   network: string,
 *   transfers: Array<{ txHash?: string, fromAddress?: string }>,
 * }} input
 */
export async function patchMissingFromAddresses(db, input) {
  const pairs = [];
  for (const t of input.transfers) {
    const txHash = typeof t.txHash === "string" ? t.txHash.trim() : "";
    const fromAddress =
      typeof t.fromAddress === "string" ? t.fromAddress.trim() : "";
    if (!txHash || !fromAddress) continue;
    pairs.push({ txHash, fromAddress });
  }
  if (pairs.length === 0) {
    return { updated: 0 };
  }

  let updated = 0;
  for (const pair of pairs) {
    const { rowCount } = await db.query(
      `UPDATE payment_orders
       SET from_address = $1,
           updated_at = now()
       WHERE network = $2
         AND tx_hash = $3
         AND from_address IS NULL`,
      [pair.fromAddress, input.network, pair.txHash],
    );
    updated += rowCount ?? 0;
  }
  return { updated };
}

/**
 * Fill missing received amount when the same tx is seen again on poll
 * (orders matched as anomaly before received_amount was persisted).
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {{
 *   network: string,
 *   transfers: Array<{ txHash?: string, amount?: string }>,
 * }} input
 */
export async function patchMissingReceivedAmounts(db, input) {
  const pairs = [];
  for (const t of input.transfers) {
    const txHash = typeof t.txHash === "string" ? t.txHash.trim() : "";
    const amount = typeof t.amount === "string" ? t.amount.trim() : "";
    if (!txHash || !amount) continue;
    pairs.push({ txHash, amount });
  }
  if (pairs.length === 0) {
    return { updated: 0 };
  }

  let updated = 0;
  for (const pair of pairs) {
    const { rowCount } = await db.query(
      `UPDATE payment_orders
       SET received_amount = $1,
           updated_at = now()
       WHERE network = $2
         AND tx_hash = $3
         AND received_amount IS NULL`,
      [pair.amount, input.network, pair.txHash],
    );
    updated += rowCount ?? 0;
  }
  return { updated };
}

/**
 * Receive addresses for recent orders that still lack payer address.
 * Included in poll watch set so patchMissingFromAddresses can fill them.
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {{ asset: string, network: string, limit?: number }} filter
 */
export async function listAddressesNeedingFromBackfill(db, filter) {
  const limit = Math.min(Math.max(filter.limit ?? 40, 1), 100);
  const { rows } = await db.query(
    `SELECT DISTINCT receive_address
     FROM payment_orders
     WHERE asset = $1
       AND network = $2
       AND tx_hash IS NOT NULL
       AND from_address IS NULL
       AND updated_at > now() - interval '14 days'
     ORDER BY receive_address
     LIMIT $3`,
    [filter.asset, filter.network, limit],
  );
  return rows.map((r) => String(r.receive_address ?? "").trim()).filter(Boolean);
}

/**
 * Receive addresses for recent orders that have a tx but no received_amount
 * (so patchMissingReceivedAmounts can fill them on the next poll).
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {{ asset: string, network: string, limit?: number }} filter
 */
export async function listAddressesNeedingReceivedBackfill(db, filter) {
  const limit = Math.min(Math.max(filter.limit ?? 40, 1), 100);
  const { rows } = await db.query(
    `SELECT DISTINCT receive_address
     FROM payment_orders
     WHERE asset = $1
       AND network = $2
       AND tx_hash IS NOT NULL
       AND received_amount IS NULL
       AND updated_at > now() - interval '14 days'
     ORDER BY receive_address
     LIMIT $3`,
    [filter.asset, filter.network, limit],
  );
  return rows.map((r) => String(r.receive_address ?? "").trim()).filter(Boolean);
}
