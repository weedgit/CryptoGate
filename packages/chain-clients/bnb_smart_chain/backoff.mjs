/**
 * BNB Smart Chain congestion backoff (same pattern as ethereum).
 */

export const BSC_RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
export const DEFAULT_BSC_MAX_ATTEMPTS = 3;
export const DEFAULT_BSC_BACKOFF_BASE_MS = 400;
export const DEFAULT_BSC_BACKOFF_MAX_MS = 30_000;
export const DEFAULT_WATCHER_ERROR_BACKOFF_CAP_MS = 30_000;

export function isRetryableBscStatus(status) {
  return BSC_RETRYABLE_STATUS.has(Number(status));
}

export function bscBackoffMs(attempt, options = {}) {
  const base = options.baseMs ?? DEFAULT_BSC_BACKOFF_BASE_MS;
  const cap = options.maxMs ?? DEFAULT_BSC_BACKOFF_MAX_MS;
  const exp = Math.min(cap, base * 2 ** Math.max(0, attempt));
  const hint = options.retryAfterMs;
  if (typeof hint === "number" && hint >= 0) {
    return Math.min(cap, Math.max(exp, hint));
  }
  return exp;
}

/**
 * @param {{ ingest?: { mode?: string, chainPollMode?: string } }} tickPayload
 * @param {number} pollIntervalMs
 */
export function extraWatcherBackoffMs(tickPayload, pollIntervalMs) {
  const ingest = tickPayload?.ingest ?? {};
  const failed =
    ingest.mode === "error" ||
    ingest.mode === "bsc-rpc-error" ||
    ingest.chainPollMode === "bsc-rpc-error";
  if (!failed) return 0;
  const extra = Math.max(pollIntervalMs, DEFAULT_BSC_BACKOFF_BASE_MS * 8);
  return Math.min(DEFAULT_WATCHER_ERROR_BACKOFF_CAP_MS, extra);
}
