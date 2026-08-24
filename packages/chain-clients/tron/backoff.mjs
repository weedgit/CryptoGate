/**
 * TronGrid / RPC congestion backoff (M3-45).
 * Pure delays — no fetch here.
 */

export const TRON_RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
export const DEFAULT_TRON_MAX_ATTEMPTS = 3;
export const DEFAULT_TRON_BACKOFF_BASE_MS = 400;
export const DEFAULT_TRON_BACKOFF_MAX_MS = 30_000;
export const DEFAULT_WATCHER_ERROR_BACKOFF_CAP_MS = 30_000;

export function isRetryableTronStatus(status) {
  return TRON_RETRYABLE_STATUS.has(Number(status));
}

/**
 * @param {Headers | Record<string, string> | undefined} headers
 * @returns {number | null} delay ms from Retry-After (seconds or HTTP-date)
 */
export function parseRetryAfterMs(headers) {
  if (!headers) return null;
  const raw =
    typeof headers.get === "function"
      ? headers.get("retry-after")
      : headers["retry-after"] ?? headers["Retry-After"];
  if (raw === undefined || raw === null || raw === "") return null;
  const sec = Number.parseInt(String(raw), 10);
  if (!Number.isNaN(sec) && sec >= 0) return sec * 1000;
  const when = Date.parse(String(raw));
  if (Number.isNaN(when)) return null;
  return Math.max(0, when - Date.now());
}

/**
 * Exponential backoff: base * 2^attempt, capped. Retry-After wins when larger.
 * @param {number} attempt 0-based
 */
export function tronBackoffMs(attempt, options = {}) {
  const base = options.baseMs ?? DEFAULT_TRON_BACKOFF_BASE_MS;
  const cap = options.maxMs ?? DEFAULT_TRON_BACKOFF_MAX_MS;
  const exp = Math.min(cap, base * 2 ** Math.max(0, attempt));
  const hint = options.retryAfterMs;
  if (typeof hint === "number" && hint >= 0) {
    return Math.min(cap, Math.max(exp, hint));
  }
  return exp;
}

/**
 * Extra sleep after a failed ingest tick (ops: do not hammer a congested node).
 * @param {{ ingest?: { mode?: string, chainPollMode?: string } }} tickPayload
 * @param {number} pollIntervalMs
 */
export function extraWatcherBackoffMs(tickPayload, pollIntervalMs) {
  const ingest = tickPayload?.ingest ?? {};
  const failed =
    ingest.mode === "error" ||
    ingest.mode === "trongrid-error" ||
    ingest.chainPollMode === "trongrid-error";
  if (!failed) return 0;
  const extra = Math.max(pollIntervalMs, DEFAULT_TRON_BACKOFF_BASE_MS * 8);
  return Math.min(DEFAULT_WATCHER_ERROR_BACKOFF_CAP_MS, extra);
}

export function sleepMs(ms, sleepImpl = (n) => new Promise((r) => setTimeout(r, n))) {
  if (ms <= 0) return Promise.resolve();
  return sleepImpl(ms);
}
