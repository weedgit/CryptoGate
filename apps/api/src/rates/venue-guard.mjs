/**
 * Per-source timeout + circuit breaker for rate venues.
 * A source that fails FAIL_THRESHOLD times in a row is skipped for OPEN_MS,
 * then gets one trial call; another failure pauses it again.
 */

export const VENUE_TIMEOUT_MS = 3_000;
export const BREAKER_FAIL_THRESHOLD = 3;
export const BREAKER_OPEN_MS = 60_000;

/** @type {Map<string, { fails: number, openUntil: number, lastError: string | null }>} */
const state = new Map();

/** @param {string} key */
function entry(key) {
  let e = state.get(key);
  if (!e) {
    e = { fails: 0, openUntil: 0, lastError: null };
    state.set(key, e);
  }
  return e;
}

/**
 * @param {string} key e.g. "kraken:ETH"
 * @param {number} [now]
 */
export function isBreakerOpen(key, now = Date.now()) {
  const e = state.get(key);
  return Boolean(e && e.openUntil > now);
}

/**
 * Run `fn` unless the breaker for `key` is open; track the outcome.
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function guardVenue(key, fn) {
  const now = Date.now();
  const e = entry(key);
  if (e.openUntil > now) {
    throw new Error(`source_paused:${Math.ceil((e.openUntil - now) / 1000)}s`);
  }
  try {
    const value = await fn();
    e.fails = 0;
    e.openUntil = 0;
    e.lastError = null;
    return value;
  } catch (err) {
    e.fails += 1;
    e.lastError = err instanceof Error ? err.message : String(err);
    if (e.fails >= BREAKER_FAIL_THRESHOLD) {
      e.openUntil = Date.now() + BREAKER_OPEN_MS;
    }
    throw err;
  }
}

/**
 * @param {string} key
 * @param {number} [now]
 * @returns {{ paused: boolean, pausedUntil: string | null, consecutiveFailures: number }}
 */
export function breakerState(key, now = Date.now()) {
  const e = state.get(key);
  if (!e) return { paused: false, pausedUntil: null, consecutiveFailures: 0 };
  const paused = e.openUntil > now;
  return {
    paused,
    pausedUntil: paused ? new Date(e.openUntil).toISOString() : null,
    consecutiveFailures: e.fails,
  };
}

export function resetVenueGuards() {
  state.clear();
}
