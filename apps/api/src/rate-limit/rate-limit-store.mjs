import { RATE_LIMIT_WINDOW_MS, rateLimitDecision } from "./rate-limit-rules.mjs";

/** @type {Map<string, number[]>} */
const buckets = new Map();

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
}
