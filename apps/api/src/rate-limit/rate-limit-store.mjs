import { RATE_LIMIT_WINDOW_MS, rateLimitDecision } from "./rate-limit-rules.mjs";

/** @type {Map<string, number[]>} */
const buckets = new Map();
let lastSweepMs = 0;

/**
 * Drop buckets with no hit inside the window. Keys include client-chosen values (IP, API key
 * id), so without this the map grows for every value ever sent (H8).
 * @param {number} now
 */
function sweepIdleBuckets(now) {
  if (now - lastSweepMs < RATE_LIMIT_WINDOW_MS) return;
  lastSweepMs = now;
  for (const [key, hits] of buckets) {
    const last = hits[hits.length - 1];
    if (last === undefined || now - last >= RATE_LIMIT_WINDOW_MS) buckets.delete(key);
  }
}

/**
 * Peek without mutating. Used so a failed bucket does not burn others.
 * @param {string} bucketKey
 * @param {number} limit
 * @param {number} [now]
 * @returns {{ ok: true, next: number[] } | { ok: false, retryAfter: number }}
 */
export function peekRateLimit(bucketKey, limit, now = Date.now()) {
  const current = buckets.get(bucketKey) ?? [];
  return rateLimitDecision(current, now, RATE_LIMIT_WINDOW_MS, limit);
}

/**
 * @param {string} bucketKey
 * @param {number[]} next
 */
export function commitRateLimit(bucketKey, next) {
  buckets.set(bucketKey, next);
  sweepIdleBuckets(next[next.length - 1] ?? Date.now());
}

/** Test helper. */
export function rateLimitBucketCount() {
  return buckets.size;
}

/**
 * In-process sliding window. Fine for a single API instance (M3-11).
 * @param {string} bucketKey
 * @param {number} limit
 * @param {number} [now]
 * @returns {{ ok: true } | { ok: false, retryAfter: number }}
 */
export function consumeRateLimit(bucketKey, limit, now = Date.now()) {
  const decision = peekRateLimit(bucketKey, limit, now);
  if (!decision.ok) return decision;
  commitRateLimit(bucketKey, decision.next);
  return { ok: true };
}

export function resetRateLimitStore() {
  buckets.clear();
  lastSweepMs = 0;
}
