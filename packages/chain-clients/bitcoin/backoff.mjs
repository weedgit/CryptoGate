export const BITCOIN_RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
export const DEFAULT_WATCHER_ERROR_BACKOFF_CAP_MS = 30_000;

export function isRetryableBitcoinStatus(status) {
  return BITCOIN_RETRYABLE_STATUS.has(Number(status));
}

export function extraWatcherBackoffMs(tickPayload, pollIntervalMs) {
  const ingest = tickPayload?.ingest ?? {};
  const failed = ingest.mode === "error" || ingest.chainPollMode === "bitcoin-api-error";
  if (!failed) return 0;
  return Math.min(DEFAULT_WATCHER_ERROR_BACKOFF_CAP_MS, Math.max(pollIntervalMs, 3200));
}
