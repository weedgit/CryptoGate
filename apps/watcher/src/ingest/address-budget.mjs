/**
 * Pending-first address selection with a hard RPC budget and fair rotation.
 * One watcher process polls many open invoices without blasting every address each tick.
 */

/** @typedef {{
 *   receiveAddress: string,
 *   status?: string,
 *   createdAt?: string | null,
 *   expiresAt?: string | null,
 * }} WatchOrderLike */

/**
 * @param {string | null | undefined} iso
 * @returns {number}
 */
function timeMs(iso) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const n = Date.parse(String(iso));
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/**
 * Lower score = higher priority.
 * pending_payment first; among those, soonest expiry then newest create (active checkout).
 * @param {WatchOrderLike[]} ordersForAddress
 */
export function addressPriorityScore(ordersForAddress) {
  const pending = ordersForAddress.filter((o) => o.status === "pending_payment");
  if (pending.length > 0) {
    let soonestExpiry = Number.POSITIVE_INFINITY;
    let newestCreate = Number.NEGATIVE_INFINITY;
    for (const o of pending) {
      soonestExpiry = Math.min(soonestExpiry, timeMs(o.expiresAt));
      const created = timeMs(o.createdAt);
      if (Number.isFinite(created)) {
        newestCreate = Math.max(newestCreate, created);
      }
    }
    return { tier: 0, soonestExpiry, newestCreate: -newestCreate };
  }
  const openMatch = ordersForAddress.some((o) =>
    ["verifying", "confirmed", "payment_anomaly", "expired"].includes(
      String(o.status ?? ""),
    ),
  );
  if (openMatch) {
    return { tier: 1, soonestExpiry: 0, newestCreate: 0 };
  }
  return { tier: 2, soonestExpiry: 0, newestCreate: 0 };
}

/**
 * @param {{ tier: number, soonestExpiry: number, newestCreate: number }} a
 * @param {{ tier: number, soonestExpiry: number, newestCreate: number }} b
 */
function compareScore(a, b) {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.soonestExpiry !== b.soonestExpiry) return a.soonestExpiry - b.soonestExpiry;
  return a.newestCreate - b.newestCreate;
}

/**
 * Rotate `items` so index `cursor % length` is first; preserves relative order.
 * @template T
 * @param {T[]} items
 * @param {number} cursor
 */
export function rotateFromCursor(items, cursor) {
  if (items.length === 0) return [];
  const start = ((cursor % items.length) + items.length) % items.length;
  if (start === 0) return items.slice();
  return items.slice(start).concat(items.slice(0, start));
}

/**
 * Pick up to `budget` distinct receive addresses for this tick.
 *
 * @param {{
 *   orders: WatchOrderLike[],
 *   extraAddresses?: string[],
 *   budget: number,
 *   cursor?: number,
 * }} input
 * @returns {{
 *   addresses: string[],
 *   nextCursor: number,
 *   pendingAddressCount: number,
 *   totalAddressCount: number,
 *   deferredAddressCount: number,
 *   budget: number,
 * }}
 */
export function selectAddressesForPoll(input) {
  const budget = Math.max(0, Math.floor(Number(input.budget) || 0));
  const cursor = Math.max(0, Math.floor(Number(input.cursor) || 0));
  /** @type {Map<string, WatchOrderLike[]>} */
  const byAddress = new Map();

  for (const order of input.orders ?? []) {
    const addr = String(order.receiveAddress ?? "").trim();
    if (!addr) continue;
    const list = byAddress.get(addr);
    if (list) list.push(order);
    else byAddress.set(addr, [order]);
  }

  for (const raw of input.extraAddresses ?? []) {
    const addr = String(raw ?? "").trim();
    if (!addr || byAddress.has(addr)) continue;
    byAddress.set(addr, []);
  }

  const ranked = [...byAddress.entries()]
    .map(([address, orders]) => ({
      address,
      score: addressPriorityScore(orders),
      pending: orders.some((o) => o.status === "pending_payment"),
    }))
    .sort((a, b) => {
      const byScore = compareScore(a.score, b.score);
      if (byScore !== 0) return byScore;
      return a.address.localeCompare(b.address);
    });

  const pendingAddressCount = ranked.filter((r) => r.pending).length;
  const totalAddressCount = ranked.length;

  if (budget === 0 || ranked.length === 0) {
    return {
      addresses: [],
      nextCursor: cursor,
      pendingAddressCount,
      totalAddressCount,
      deferredAddressCount: ranked.length,
      budget,
    };
  }

  if (ranked.length <= budget) {
    return {
      addresses: ranked.map((r) => r.address),
      nextCursor: 0,
      pendingAddressCount,
      totalAddressCount,
      deferredAddressCount: 0,
      budget,
    };
  }

  // Fairness: rotate within the pending tier first, then fill from the rest.
  const pending = ranked.filter((r) => r.pending);
  const rest = ranked.filter((r) => !r.pending);
  const rotatedPending = rotateFromCursor(pending, cursor);
  const takePending = rotatedPending.slice(0, budget);
  const remaining = budget - takePending.length;
  const rotatedRest = rotateFromCursor(rest, cursor);
  const takeRest = rotatedRest.slice(0, remaining);
  const selected = [...takePending, ...takeRest];

  return {
    addresses: selected.map((r) => r.address),
    nextCursor: cursor + selected.length,
    pendingAddressCount,
    totalAddressCount,
    deferredAddressCount: totalAddressCount - selected.length,
    budget,
  };
}

/**
 * Adaptive sleep between watcher ticks.
 * Pending (Detected path) uses the hot interval; confirming uses normal; idle slows down.
 *
 * @param {{
 *   pendingPollIntervalMs: number,
 *   pollIntervalMs: number,
 *   idlePollIntervalMs: number,
 * }} config
 * @param {{ pendingPaymentOrders?: number, awaitingConfirmations?: number }} workload
 */
export function resolveNextPollIntervalMs(config, workload = {}) {
  const pending = Number(workload.pendingPaymentOrders) || 0;
  const awaiting = Number(workload.awaitingConfirmations) || 0;
  if (pending > 0) return config.pendingPollIntervalMs;
  if (awaiting > 0) return config.pollIntervalMs;
  return config.idlePollIntervalMs;
}

/**
 * Detection lag from chain block time (when the provider supplies it).
 * @param {{ blockTimestampMs?: number | null, nowMs?: number }} input
 * @returns {number | null}
 */
export function detectionLatencyFromBlockMs(input) {
  const block = Number(input.blockTimestampMs);
  if (!Number.isFinite(block) || block <= 0) return null;
  const now = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  return Math.max(0, Math.round(now - block));
}
