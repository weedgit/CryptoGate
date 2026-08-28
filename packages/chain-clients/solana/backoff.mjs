export const SOLANA_RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
export const DEFAULT_WATCHER_ERROR_BACKOFF_CAP_MS = 30_000;

export function isRetryableSolanaStatus(status) {
  return SOLANA_RETRYABLE_STATUS.has(Number(status));
}

export function solanaBackoffMs(attempt, options = {}) {
  const base = options.baseMs ?? 400;
  const cap = options.maxMs ?? 30_000;
  return Math.min(cap, base * 2 ** Math.max(0, attempt));
}

export function extraWatcherBackoffMs(tickPayload, pollIntervalMs) {
  const ingest = tickPayload?.ingest ?? {};
  const failed =
    ingest.mode === "error" || ingest.chainPollMode === "solana-rpc-error";
  if (!failed) return 0;
  return Math.min(DEFAULT_WATCHER_ERROR_BACKOFF_CAP_MS, Math.max(pollIntervalMs, 3200));
}
