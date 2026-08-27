/**
 * Read watcher heartbeats for System health (B17).
 */
import { getPool } from "../db/pool.mjs";

/**
 * @param {{
 *   healthScore: number,
 *   status: string,
 *   tickAt: string,
 *   pollIntervalMs: number,
 * }} row
 * @param {number} [nowMs]
 */
export function applyHeartbeatLag(row, nowMs = Date.now()) {
  const interval = Math.max(1000, row.pollIntervalMs || 5000);
  const tickMs = Date.parse(row.tickAt);
  const lagMs = Number.isFinite(tickMs) ? Math.max(0, nowMs - tickMs) : 0;
  let score = row.healthScore;
  let status = row.status;

  if (lagMs > interval * 10) {
    score = Math.min(score, 20);
    status = "down";
  } else if (lagMs > interval * 5) {
    score = Math.min(score, 55);
    if (status === "ok") status = "degraded";
  } else if (lagMs > interval * 2) {
    score = Math.min(score, 80);
    if (status === "ok") status = "degraded";
  }

  return {
    ...row,
    healthScore: score,
    status,
    lagMs,
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function mapHeartbeatRow(row) {
  const base = {
    network: String(row.network),
    asset: String(row.asset),
    tick: Number(row.tick),
    status: String(row.status),
    healthScore: Number(row.health_score),
    rpcOk: Boolean(row.rpc_ok),
    rpcMode: String(row.rpc_mode),
    ingestMode: String(row.ingest_mode),
    pollIntervalMs: Number(row.poll_interval_ms),
    openOrders: Number(row.open_orders),
    awaitingConfirmations: Number(row.awaiting_confirmations),
    transfersSeen: Number(row.transfers_seen),
    lastError: row.last_error == null ? null : String(row.last_error),
    detail:
      row.detail && typeof row.detail === "object" && !Array.isArray(row.detail)
        ? row.detail
        : {},
    tickAt:
      row.tick_at instanceof Date
        ? row.tick_at.toISOString()
        : String(row.tick_at),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
  return applyHeartbeatLag(base);
}

/**
 * Latest heartbeat per network (table is 1 row per network).
 * @returns {Promise<ReturnType<typeof mapHeartbeatRow>[]>}
 */
export async function listWatcherHeartbeats() {
  const { rows } = await getPool().query(
    `SELECT network, asset, tick, status, health_score, rpc_ok, rpc_mode,
            ingest_mode, poll_interval_ms, open_orders, awaiting_confirmations,
            transfers_seen, last_error, detail, tick_at, updated_at
     FROM watcher_heartbeats
     ORDER BY network ASC`,
  );
  return rows.map(mapHeartbeatRow);
}
