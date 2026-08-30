/**
 * Persist per-network watcher heartbeats. No apps/api imports.
 */
import { computeWatcherHealthScore } from "./score.mjs";

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {{
 *   network: string,
 *   asset: string,
 *   tick: number,
 *   status: string,
 *   healthScore: number,
 *   rpcOk: boolean,
 *   rpcMode: string,
 *   ingestMode: string,
 *   pollIntervalMs: number,
 *   openOrders?: number,
 *   awaitingConfirmations?: number,
 *   transfersSeen?: number,
 *   lastError?: string | null,
 *   detail?: Record<string, unknown>,
 *   tickAt: string,
 * }} row
 */
export async function upsertWatcherHeartbeat(db, row) {
  await db.query(
    `INSERT INTO watcher_heartbeats (
       network, asset, tick, status, health_score, rpc_ok, rpc_mode,
       ingest_mode, poll_interval_ms, open_orders, awaiting_confirmations,
       transfers_seen, last_error, detail, tick_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11,
       $12, $13, $14::jsonb, $15::timestamptz, now()
     )
     ON CONFLICT (network) DO UPDATE SET
       asset = EXCLUDED.asset,
       tick = EXCLUDED.tick,
       status = EXCLUDED.status,
       health_score = EXCLUDED.health_score,
       rpc_ok = EXCLUDED.rpc_ok,
       rpc_mode = EXCLUDED.rpc_mode,
       ingest_mode = EXCLUDED.ingest_mode,
       poll_interval_ms = EXCLUDED.poll_interval_ms,
       open_orders = EXCLUDED.open_orders,
       awaiting_confirmations = EXCLUDED.awaiting_confirmations,
       transfers_seen = EXCLUDED.transfers_seen,
       last_error = EXCLUDED.last_error,
       detail = EXCLUDED.detail,
       tick_at = EXCLUDED.tick_at,
       updated_at = now()`,
    [
      row.network,
      row.asset,
      row.tick,
      row.status,
      row.healthScore,
      row.rpcOk,
      row.rpcMode,
      row.ingestMode,
      row.pollIntervalMs,
      row.openOrders ?? 0,
      row.awaitingConfirmations ?? 0,
      row.transfersSeen ?? 0,
      row.lastError ?? null,
      JSON.stringify(row.detail ?? {}),
      row.tickAt,
    ],
  );
}

/**
 * Write heartbeats for each chain checked in the tick payload.
 *
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {{
 *   tick: number,
 *   at: string,
 *   pollIntervalMs: number,
 *   target: { asset: string, network: string },
 *   targets?: Array<{ asset: string, network: string }>,
 *   chain: Record<string, { ok?: boolean, mode?: string, rpcConfigured?: boolean, asset?: string }>,
 *   ingest: Record<string, unknown>,
 *   ingestByNetwork?: Record<string, Record<string, unknown>>,
 * }} payload
 */
export async function persistTickHeartbeats(db, payload) {
  const networks = Object.keys(payload.chain ?? {});
  const activeNetworks = new Set(
    (payload.targets ?? [payload.target]).map((t) => t.network),
  );
  for (const network of networks) {
    const chain = payload.chain[network];
    if (!chain) continue;
    const isActiveTarget = activeNetworks.has(network);
    const perNet = payload.ingestByNetwork?.[network];
    const ingest = isActiveTarget
      ? (perNet ?? payload.ingest)
      : { mode: "idle", note: "not active watcher target" };
    const scored = computeWatcherHealthScore({
      chain,
      ingest,
      isActiveTarget,
    });
    const lastError =
      (typeof ingest.error === "string" && ingest.error) ||
      (typeof ingest.ingestError === "string" && ingest.ingestError) ||
      null;

    await upsertWatcherHeartbeat(db, {
      network,
      asset: chain.asset ?? payload.target.asset,
      tick: payload.tick,
      status: scored.status,
      healthScore: scored.score,
      rpcOk: chain.ok !== false && chain.rpcConfigured === true,
      rpcMode: chain.mode ?? "unknown",
      ingestMode: String(ingest.mode ?? "unknown"),
      pollIntervalMs: payload.pollIntervalMs,
      openOrders: Number(ingest.openOrders ?? 0) || 0,
      awaitingConfirmations: Number(ingest.awaitingConfirmations ?? 0) || 0,
      transfersSeen: Number(ingest.transfersSeen ?? 0) || 0,
      lastError,
      detail: {
        reasons: scored.reasons,
        isActiveTarget,
        chainPollMode: ingest.chainPollMode ?? null,
        phase: ingest.phase ?? null,
        multiNetwork: Boolean(payload.targets && payload.targets.length > 1),
      },
      tickAt: payload.at,
    });
  }
}
