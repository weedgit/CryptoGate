/**
 * Optional transfer hints from external chain push (webhooks / WS bridges).
 * Same watcher process merges hints into the next match tick — not a process per invoice.
 *
 * Providers (Helius, QuickNode, TronGrid callback, etc.) should POST into an API
 * sidecar later; for now tests and local ops can pushTransferHint().
 */

/** @typedef {{
 *   toAddress: string,
 *   amount: string,
 *   asset: string,
 *   network: string,
 *   txHash: string,
 *   memoOrTag?: string,
 *   fromAddress?: string,
 *   blockTimestampMs?: number,
 * }} TransferHint */

/** @type {TransferHint[]} */
const queue = [];

const MAX_QUEUE = 5000;

/**
 * @param {TransferHint} hint
 * @returns {boolean} false if rejected (incomplete) or dropped by cap
 */
export function pushTransferHint(hint) {
  const toAddress = String(hint?.toAddress ?? "").trim();
  const amount = String(hint?.amount ?? "").trim();
  const asset = String(hint?.asset ?? "").trim();
  const network = String(hint?.network ?? "").trim();
  const txHash = String(hint?.txHash ?? "").trim();
  if (!toAddress || !amount || !asset || !network || !txHash) return false;
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push({
    toAddress,
    amount,
    asset,
    network,
    txHash,
    memoOrTag: hint.memoOrTag,
    fromAddress: hint.fromAddress,
    blockTimestampMs: hint.blockTimestampMs,
  });
  return true;
}

/**
 * Drain hints for one asset+network scope (and optional address filter).
 * @param {{ asset: string, network: string, watchedAddresses?: string[] }} filter
 * @returns {TransferHint[]}
 */
export function drainTransferHints(filter) {
  if (queue.length === 0) return [];
  const asset = String(filter.asset);
  const network = String(filter.network);
  const watched = filter.watchedAddresses?.length
    ? new Set(filter.watchedAddresses.map((a) => a.trim()).filter(Boolean))
    : null;

  /** @type {TransferHint[]} */
  const kept = [];
  /** @type {TransferHint[]} */
  const taken = [];
  for (const hint of queue) {
    const matchAsset = hint.asset === asset;
    const matchNet = hint.network === network;
    const matchAddr = !watched || watched.has(hint.toAddress);
    if (matchAsset && matchNet && matchAddr) taken.push(hint);
    else kept.push(hint);
  }
  queue.length = 0;
  queue.push(...kept);
  return taken;
}

/** @returns {number} */
export function transferHintQueueSize() {
  return queue.length;
}

/** Test helper. */
export function resetTransferHints() {
  queue.length = 0;
}
