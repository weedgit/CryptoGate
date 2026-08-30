/**
 * Shared HTTP timeout for all chain RPC / provider calls.
 * Empty RPC stays stub (no fetch). Configured but hanging RPCs must fail
 * fast so watcher multi-network ticks cannot stall forever.
 */

export const DEFAULT_CHAIN_FETCH_TIMEOUT_MS = 15_000;
export const MAX_CHAIN_FETCH_TIMEOUT_MS = 120_000;

/**
 * @param {string | undefined | null} [raw]
 * @returns {number}
 */
export function chainFetchTimeoutMs(raw = process.env.CHAIN_FETCH_TIMEOUT_MS) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return DEFAULT_CHAIN_FETCH_TIMEOUT_MS;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_CHAIN_FETCH_TIMEOUT_MS;
  return Math.min(Math.floor(n), MAX_CHAIN_FETCH_TIMEOUT_MS);
}

/**
 * @param {typeof fetch | undefined} fetchImpl
 * @param {string | URL} url
 * @param {RequestInit} [init]
 * @param {number} [timeoutMs]
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(
  fetchImpl,
  url,
  init = {},
  timeoutMs = chainFetchTimeoutMs(),
) {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== "function") {
    throw new Error("fetch is not available in this runtime");
  }

  const controller = new AbortController();
  const upstream = init.signal;
  /** @type {(() => void) | undefined} */
  let onUpstreamAbort;
  if (upstream) {
    if (upstream.aborted) {
      controller.abort();
    } else {
      onUpstreamAbort = () => controller.abort();
      upstream.addEventListener("abort", onUpstreamAbort, { once: true });
    }
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const aborted =
      name === "AbortError" ||
      (err instanceof Error && /aborted|AbortError/i.test(err.message));
    if (aborted && !upstream?.aborted) {
      const timeoutErr = new Error(
        `chain fetch timeout after ${timeoutMs}ms`,
      );
      // @ts-expect-error attach HTTP-ish status for backoff helpers
      timeoutErr.status = 408;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (upstream && onUpstreamAbort) {
      upstream.removeEventListener("abort", onUpstreamAbort);
    }
  }
}
