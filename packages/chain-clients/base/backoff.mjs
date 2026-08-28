export const BASE_RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
export const DEFAULT_BASE_BACKOFF_BASE_MS = 400;
export const DEFAULT_WATCHER_ERROR_BACKOFF_CAP_MS = 30_000;

export function isRetryableBaseStatus(status) {
  return BASE_RETRYABLE_STATUS.has(Number(status));
}

export function baseBackoffMs(attempt, options = {}) {
  const base = options.baseMs ?? DEFAULT_BASE_BACKOFF_BASE_MS;
  const cap = options.maxMs ?? 30_000;
  const exp = Math.min(cap, base * 2 ** Math.max(0, attempt));
  if (typeof options.retryAfterMs === "number" && options.retryAfterMs >= 0) {
    return Math.min(cap, Math.max(exp, options.retryAfterMs));
  }
  return exp;
}

export function extraWatcherBackoffMs(tickPayload, pollIntervalMs) {
  const ingest = tickPayload?.ingest ?? {};
  const failed =
    ingest.mode === "error" ||
    ingest.chainPollMode === "base-rpc-error";
  if (!failed) return 0;
  return Math.min(DEFAULT_WATCHER_ERROR_BACKOFF_CAP_MS, Math.max(pollIntervalMs, 3200));
}
