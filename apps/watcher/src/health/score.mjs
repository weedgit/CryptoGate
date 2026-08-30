/**
 * Pure watcher health score from tick signals (no DB / API imports).
 *
 * @param {{
 *   chain: { ok?: boolean, mode?: string, rpcConfigured?: boolean } | null | undefined,
 *   ingest: {
 *     mode?: string,
 *     ingestError?: string | null,
 *     error?: string | null,
 *   } | null | undefined,
 *   isActiveTarget?: boolean,
 * }} input
 * @returns {{ score: number, status: 'ok' | 'degraded' | 'down' | 'unknown', reasons: string[] }}
 */
export function computeWatcherHealthScore(input) {
  const chain = input.chain ?? {};
  const ingest = input.ingest ?? {};
  const isActiveTarget = input.isActiveTarget !== false;
  /** @type {string[]} */
  const reasons = [];
  let score = 100;
  /** @type {'ok' | 'degraded' | 'down' | 'unknown'} */
  let status = "ok";

  const rpcConfigured = chain.rpcConfigured === true;
  const stub = !rpcConfigured || chain.mode === "stub";
  if (stub) {
    score -= 20;
    status = "degraded";
    reasons.push("rpc_stub_or_unconfigured");
  } else if (chain.ok === false) {
    score = Math.min(score, 25);
    status = "down";
    reasons.push("rpc_unreachable");
  }

  if (!isActiveTarget) {
    // Non-target networks only report RPC readiness.
    score = Math.max(0, Math.min(100, score));
    return { score, status, reasons };
  }

  if (ingest.mode === "error") {
    score = Math.min(score, 25);
    status = "down";
    reasons.push("ingest_error");
  } else if (ingest.mode === "noop") {
    score = Math.min(score, 60);
    if (status === "ok") status = "unknown";
    reasons.push("db_disabled");
  } else if (ingest.mode === "idle") {
    score = Math.min(score, 85);
    if (status === "ok") status = "degraded";
    reasons.push("not_active_target");
  }

  if (ingest.ingestError || ingest.error) {
    score -= 15;
    if (status === "ok") status = "degraded";
    reasons.push("poll_error");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, status, reasons };
}

/**
 * Apply lag after last tick (API read path). Mutates a copy.
 *
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

  // Keep in sync with apps/api watcher-health-store — multi-network ticks can
  // exceed 10× a short poll interval without the process being dead.
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
