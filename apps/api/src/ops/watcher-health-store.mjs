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

  // Multi-network ticks often exceed 10× a 5s poll (RPC + open-order scopes).
  // Floor thresholds so a slow-but-alive watcher is not painted "down 20%".
  const softLag = Math.max(interval * 2, 45_000);
  const hardLag = Math.max(interval * 5, 90_000);
  const downLag = Math.max(interval * 10, 180_000);

  if (lagMs > downLag) {
    score = Math.min(score, 20);
    status = "down";
  } else if (lagMs > hardLag) {
    score = Math.min(score, 55);
    if (status === "ok") status = "degraded";
  } else if (lagMs > softLag) {
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
