/**
 * Ethereum JSON-RPC — USDT ERC-20 Transfer logs + confirmations (M3-32).
 */

import { fetchWithTimeout } from "../fetch-timeout.mjs";
import { minorToMajor } from "../tron/amount.mjs";
import {
  DEFAULT_ETH_MAX_ATTEMPTS,
  ethBackoffMs,
  isRetryableEthStatus,
  parseRetryAfterMs,
  sleepMs,
} from "./backoff.mjs";
import { ERC20_TRANSFER_TOPIC, getEthereumRuntimeConfig } from "./config.mjs";

/**
 * @param {string} rpcUrl
 * @param {string} method
 * @param {unknown[]} params
 * @param {{ fetchImpl?: typeof fetch, apiKey?: string }} opts
 */
export async function jsonRpcCall(rpcUrl, method, params, opts = {}) {
  /** @type {Record<string, string>} */
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

  const res = await fetchWithTimeout(opts.fetchImpl, rpcUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`eth rpc HTTP ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    err.retryAfterMs = parseRetryAfterMs(res.headers);
    throw err;
  }
  const body = await res.json();
  if (body.error) {
    const err = new Error(`eth rpc error: ${body.error.message ?? JSON.stringify(body.error)}`);
    err.status = 502;
    throw err;
  }
  return body.result;
}

export async function withEthRetry(fn, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_ETH_MAX_ATTEMPTS;
  const sleepImpl = opts.sleepImpl;
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.status;
      const retryable = isRetryableEthStatus(status);
      if (!retryable || attempt === maxAttempts - 1) throw err;
      const delay = ethBackoffMs(attempt, { retryAfterMs: err.retryAfterMs });
      await sleepMs(delay, sleepImpl);
    }
  }
  throw lastErr;
}

/**
 * @param {string} address
 * @returns {string | null}
 */
export function padAddressTopic(address) {
  const hex = address.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(hex)) return null;
  return `0x${hex.padStart(64, "0")}`;
}

/**
 * @param {Record<string, unknown>} log
 * @param {{ contractAddress: string, decimals: number, asset?: string, network?: string }} cfg
 */
export function mapTransferLog(log, cfg) {
  const logAddress = String(log.address ?? "").trim().toLowerCase();
  if (logAddress !== cfg.contractAddress.trim().toLowerCase()) return null;

  const topics = Array.isArray(log.topics) ? log.topics : [];
  if (String(topics[0] ?? "").toLowerCase() !== ERC20_TRANSFER_TOPIC) return null;

  const toTopic = topics[2];
  if (typeof toTopic !== "string") return null;
  const toHex = toTopic.replace(/^0x/, "").slice(-40).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(toHex)) return null;
  const toAddress = `0x${toHex}`;

  const fromTopic = topics[1];
  let fromAddress;
  if (typeof fromTopic === "string") {
    const fromHex = fromTopic.replace(/^0x/, "").slice(-40).toLowerCase();
    if (/^[0-9a-f]{40}$/.test(fromHex)) {
      fromAddress = `0x${fromHex}`;
    }
  }

  const txHash = String(log.transactionHash ?? "").trim();
  const data = String(log.data ?? "").trim();
  if (!txHash || !data) return null;

  const minorHex = data.replace(/^0x/, "");
  if (!/^[0-9a-f]+$/i.test(minorHex)) return null;

  let amount;
  try {
    amount = minorToMajor(BigInt(`0x${minorHex}`).toString(10), cfg.decimals);
  } catch {
    return null;
  }

  return {
    toAddress,
    fromAddress,
    amount,
    txHash,
    asset: cfg.asset ?? "USDT",
    network: cfg.network ?? "ethereum",
    memoOrTag: undefined,
  };
}

function toHexBlock(n) {
  return `0x${n.toString(16)}`;
}

/** Block number → timestamp (ms); blocks are immutable once read, reorgs re-read via the overlap. */
const blockTimestampCache = new Map();
const BLOCK_TIMESTAMP_CACHE_MAX = 2048;

/**
 * @param {unknown} hexSeconds
 * @returns {number | undefined}
 */
function hexSecondsToMs(hexSeconds) {
  const seconds = Number.parseInt(String(hexSeconds ?? ""), 16);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

/**
 * Block time for transfer eligibility (a transfer older than the order must not bind to it).
 * Uses `blockTimestamp` on the log when the node returns it, else one eth_getBlockByNumber.
 * @param {Record<string, unknown>} log
 * @param {{ rpcUrl: string, apiKey?: string }} cfg
 * @param {{ fetchImpl?: typeof fetch, sleepImpl?: (ms: number) => Promise<void> }} input
 */
async function logBlockTimestampMs(log, cfg, input) {
  const fromLog = hexSecondsToMs(log.blockTimestamp);
  if (fromLog !== undefined) return fromLog;
  const blockHex = String(log.blockNumber ?? "");
  if (!/^0x[0-9a-f]+$/i.test(blockHex)) return undefined;
  const cacheKey = `${cfg.rpcUrl}|${blockHex.toLowerCase()}`;
  if (blockTimestampCache.has(cacheKey)) return blockTimestampCache.get(cacheKey);
  const block = await withEthRetry(
    () =>
      jsonRpcCall(cfg.rpcUrl, "eth_getBlockByNumber", [blockHex, false], {
        fetchImpl: input.fetchImpl,
        apiKey: cfg.apiKey,
      }),
    { sleepImpl: input.sleepImpl },
  );
  const ms = hexSecondsToMs(block?.timestamp);
  if (ms !== undefined) {
    if (blockTimestampCache.size >= BLOCK_TIMESTAMP_CACHE_MAX) {
      blockTimestampCache.delete(blockTimestampCache.keys().next().value);
    }
    blockTimestampCache.set(cacheKey, ms);
  }
  return ms;
}

/** Recent blocks re-read every cycle so a late-indexed or reorged transfer is still seen. */
export const ERC20_RESCAN_BLOCKS = 12;
/** Watched addresses per eth_getLogs call (topic OR-list). */
export const ERC20_ADDRESS_CHUNK = 50;
/** Full blocks fetched per cycle for native ETH; a backlog is caught up over later cycles. */
export const DEFAULT_NATIVE_MAX_BLOCKS_PER_TICK = 5;
/** Blocks per eth_getLogs call while an address catches up (providers cap ranges ~2k–10k). */
export const ERC20_MAX_SPAN_BLOCKS = 2000;
/** Oldest block any catch-up reaches back to (~7 days of 12 s slots, the late-payment window). */
export const MAX_CATCHUP_BLOCKS = 50_400;
const ETH_SLOT_MS = 12_000;
const ADDRESS_CURSOR_MAX = 20_000;

/** Native ETH: last block fully scanned, per RPC + network + asset. */
const scanCursors = new Map();
/**
 * ERC-20: last block scanned per watched address. The watcher polls a rotating subset of
 * addresses, so one shared cursor would skip blocks for addresses deferred by the rotation (H5).
 */
const addressCursors = new Map();

export function resetEthScanCursors() {
  scanCursors.clear();
  addressCursors.clear();
  blockTimestampCache.clear();
}

/**
 * Earliest block that can hold a transfer made at or after `sinceMs`. Missed slots mean fewer
 * blocks than elapsed slots, so this errs earlier (safe); capped at MAX_CATCHUP_BLOCKS.
 * @param {number} latest
 * @param {number} sinceMs
 * @param {number} nowMs
 */
export function blockAtOrBefore(latest, sinceMs, nowMs) {
  const back = Math.ceil(Math.max(0, nowMs - sinceMs) / ETH_SLOT_MS) + ERC20_RESCAN_BLOCKS;
  return Math.max(0, latest - Math.min(back, MAX_CATCHUP_BLOCKS));
}

/**
 * Where a never-scanned address (or the native block scan) starts: the oldest open order's
 * creation when the watcher passes it, else the configured lookback. Restarts and RPC outages
 * therefore resume from the orders, not from `latest - lookback`.
 * @param {number} latest
 * @param {number | undefined} sinceMs
 * @param {{ blockLookback: number }} cfg
 * @param {number} nowMs
 */
function firstScanBlock(latest, sinceMs, cfg, nowMs) {
  if (Number.isFinite(sinceMs)) return blockAtOrBefore(latest, Number(sinceMs), nowMs);
  return Math.max(0, latest - cfg.blockLookback);
}

/**
 * @param {Record<string, number> | undefined} addressSinceMs
 * @param {string[]} addresses
 */
function oldestSinceMs(addressSinceMs, addresses) {
  let oldest;
  for (const a of addresses) {
    const ms = Number(addressSinceMs?.[a]);
    if (Number.isFinite(ms) && (oldest === undefined || ms < oldest)) oldest = ms;
  }
  return oldest;
}

/**
 * @param {{ rpcUrl: string, network: string, asset: string }} cfg
 * @param {string} kind
 */
function cursorKey(cfg, kind) {
  return `${cfg.rpcUrl}|${cfg.network}|${cfg.asset}|${kind}`;
}

/**
 * Block range for this cycle: from the cursor (re-reading `overlap` recent blocks), or
 * `startIfNew` before the first scan; never older than `floor`, at most `maxSpan` blocks.
 * @param {number | undefined} cursor
 * @param {number} latest
 * @param {{ floor: number, startIfNew: number, overlap: number, maxSpan: number }} opts
 */
export function scanRange(cursor, latest, opts) {
  const start = Math.max(
    opts.floor,
    cursor == null ? opts.startIfNew : cursor + 1 - opts.overlap,
  );
  const end = Math.min(latest, start + Math.max(1, opts.maxSpan) - 1);
  return { fromBlock: start, toBlock: end };
}

async function latestBlock(cfg, input) {
  const latestHex = await withEthRetry(
    () =>
      jsonRpcCall(cfg.rpcUrl, "eth_blockNumber", [], {
        fetchImpl: input.fetchImpl,
        apiKey: cfg.apiKey,
      }),
    { sleepImpl: input.sleepImpl },
  );
  const latest = Number.parseInt(String(latestHex), 16);
  if (!Number.isFinite(latest) || latest < 0) {
    throw new Error("eth_blockNumber returned invalid block");
  }
  return latest;
}

/**
 * @param {{
 *   watchedAddresses: string[],
 *   addressSinceMs?: Record<string, number>,
 *   nowMs?: number,
 *   fetchImpl?: typeof fetch,
 *   sleepImpl?: (ms: number) => Promise<void>,
 *   runtimeConfig?: ReturnType<typeof getEthereumRuntimeConfig>,
 *   pollMode?: string,
 * }} input
 */
export async function fetchErc20TransfersForAddresses(input) {
  const cfg = input.runtimeConfig ?? getEthereumRuntimeConfig();
  const pollMode = input.pollMode ?? "eth-rpc";
  if (!cfg.configured) {
    return { transfers: [], mode: "stub", watchedAddressCount: 0 };
  }

  const watched = [...new Set(input.watchedAddresses.map((a) => a.trim()).filter(Boolean))];
  if (watched.length === 0) {
    return { transfers: [], mode: pollMode, watchedAddressCount: 0 };
  }

  const latest = await latestBlock(cfg, input);
  const key = cursorKey(cfg, "erc20");
  const nowMs = input.nowMs ?? Date.now();
  const floor = Math.max(0, latest - MAX_CATCHUP_BLOCKS);
  /** @type {Map<string, { topic: string, cursorKey: string, from: number }>} */
  const byTopic = new Map();
  for (const address of watched) {
    const topic = padAddressTopic(address);
    if (!topic || byTopic.has(topic)) continue;
    const addressKey = `${key}|${topic}`;
    const { fromBlock } = scanRange(addressCursors.get(addressKey), latest, {
      floor,
      startIfNew: firstScanBlock(latest, input.addressSinceMs?.[address], cfg, nowMs),
      overlap: ERC20_RESCAN_BLOCKS,
      maxSpan: ERC20_MAX_SPAN_BLOCKS,
    });
    byTopic.set(topic, { topic, cursorKey: addressKey, from: fromBlock });
  }
  // Up-to-date addresses share calls; ones still catching up are chunked separately (oldest
  // first) so they never hold back detection on fresh orders.
  const current = [];
  const behind = [];
  for (const entry of byTopic.values()) {
    (latest - entry.from + 1 > ERC20_MAX_SPAN_BLOCKS ? behind : current).push(entry);
  }
  behind.sort((a, b) => a.from - b.from);
  const chunks = [];
  for (const group of [current, behind]) {
    for (let i = 0; i < group.length; i += ERC20_ADDRESS_CHUNK) {
      chunks.push(group.slice(i, i + ERC20_ADDRESS_CHUNK));
    }
  }
  /** @type {Array<{ toAddress: string, amount: string, txHash: string, asset?: string, network?: string, memoOrTag?: string }>} */
  const transfers = [];

  for (const entries of chunks) {
    const fromBlock = Math.min(...entries.map((e) => e.from));
    const toBlock = Math.min(latest, fromBlock + ERC20_MAX_SPAN_BLOCKS - 1);
    if (fromBlock > toBlock) continue;
    const chunk = entries.map((e) => e.topic);
    const logs = await withEthRetry(
      () =>
        jsonRpcCall(
          cfg.rpcUrl,
          "eth_getLogs",
          [
            {
              address: cfg.usdtContractAddress,
              fromBlock: toHexBlock(fromBlock),
              toBlock: toHexBlock(toBlock),
              topics: [ERC20_TRANSFER_TOPIC, null, chunk.length === 1 ? chunk[0] : chunk],
            },
          ],
          { fetchImpl: input.fetchImpl, apiKey: cfg.apiKey },
        ),
      { sleepImpl: input.sleepImpl },
    );

    const rows = Array.isArray(logs) ? logs : [];
    for (const row of rows) {
      const mapped = mapTransferLog(/** @type {Record<string, unknown>} */ (row), {
        contractAddress: cfg.usdtContractAddress,
        decimals: cfg.decimals,
        asset: cfg.asset,
        network: cfg.network,
      });
      if (!mapped) continue;
      mapped.blockTimestampMs = await logBlockTimestampMs(
        /** @type {Record<string, unknown>} */ (row),
        { rpcUrl: cfg.rpcUrl, apiKey: cfg.apiKey },
        input,
      );
      transfers.push(mapped);
    }
    for (const entry of entries) {
      const prev = addressCursors.get(entry.cursorKey);
      addressCursors.delete(entry.cursorKey);
      addressCursors.set(entry.cursorKey, Math.max(prev ?? -1, toBlock));
    }
    while (addressCursors.size > ADDRESS_CURSOR_MAX) {
      addressCursors.delete(addressCursors.keys().next().value);
    }
  }

  return {
    transfers,
    mode: pollMode,
    watchedAddressCount: watched.length,
  };
}

/**
 * Scan new blocks for native ETH transfers to watched addresses. A block scan sees every
 * address at once, so it matches all open-order addresses (`allWatchedAddresses`), not only
 * the rotation subset polled this tick (H5).
 * @param {{
 *   watchedAddresses: string[],
 *   allWatchedAddresses?: string[],
 *   addressSinceMs?: Record<string, number>,
 *   nowMs?: number,
 *   fetchImpl?: typeof fetch,
 *   sleepImpl?: (ms: number) => Promise<void>,
 *   runtimeConfig?: ReturnType<typeof getEthereumRuntimeConfig>,
 *   pollMode?: string,
 * }} input
 */
export async function fetchNativeEthTransfersForAddresses(input) {
  const cfg = input.runtimeConfig ?? getEthereumRuntimeConfig();
  const pollMode = input.pollMode ?? "eth-rpc";
  if (!cfg.configured) {
    return { transfers: [], mode: "stub", watchedAddressCount: 0 };
  }

  const addresses = [...(input.watchedAddresses ?? []), ...(input.allWatchedAddresses ?? [])];
  const watchedSet = new Set(addresses.map((a) => a.trim().toLowerCase()).filter(Boolean));
  if (watchedSet.size === 0) {
    return { transfers: [], mode: pollMode, watchedAddressCount: 0 };
  }

  const latest = await latestBlock(cfg, input);
  const key = cursorKey(cfg, "native");
  const { fromBlock, toBlock } = scanRange(scanCursors.get(key), latest, {
    floor: Math.max(0, latest - MAX_CATCHUP_BLOCKS),
    startIfNew: firstScanBlock(
      latest,
      oldestSinceMs(input.addressSinceMs, addresses),
      cfg,
      input.nowMs ?? Date.now(),
    ),
    overlap: 1,
    maxSpan: cfg.nativeMaxBlocksPerTick ?? DEFAULT_NATIVE_MAX_BLOCKS_PER_TICK,
  });
  /** @type {Array<{ toAddress: string, amount: string, txHash: string, asset?: string, network?: string }>} */
  const transfers = [];

  for (let blockNum = fromBlock; blockNum <= toBlock; blockNum += 1) {
    const block = await withEthRetry(
      () =>
        jsonRpcCall(cfg.rpcUrl, "eth_getBlockByNumber", [toHexBlock(blockNum), true], {
          fetchImpl: input.fetchImpl,
          apiKey: cfg.apiKey,
        }),
      { sleepImpl: input.sleepImpl },
    );
    const txs = Array.isArray(block?.transactions) ? block.transactions : [];
    const blockTimestampMs = hexSecondsToMs(block?.timestamp);
    for (const tx of txs) {
      const to = String(tx?.to ?? "").trim().toLowerCase();
      const valueHex = String(tx?.value ?? "0x0");
      if (!to || !watchedSet.has(to) || valueHex === "0x0") continue;
      const txHash = String(tx?.hash ?? "").trim();
      if (!txHash) continue;
      let amount;
      try {
        amount = minorToMajor(BigInt(valueHex).toString(), cfg.decimals);
      } catch {
        continue;
      }
      // A reverted tx (e.g. out of gas into a contract wallet) is mined but moves no value (H4).
      const receipt = await withEthRetry(
        () =>
          jsonRpcCall(cfg.rpcUrl, "eth_getTransactionReceipt", [txHash], {
            fetchImpl: input.fetchImpl,
            apiKey: cfg.apiKey,
          }),
        { sleepImpl: input.sleepImpl },
      );
      if (!isSuccessfulReceipt(receipt)) continue;
      transfers.push({
        toAddress: to,
        amount,
        txHash,
        asset: cfg.asset,
        network: cfg.network,
        blockTimestampMs,
      });
    }
    scanCursors.set(key, blockNum);
  }

  return { transfers, mode: pollMode, watchedAddressCount: watchedSet.size };
}

/**
 * Post-Byzantium receipts carry `status` (0x1 success, 0x0 reverted).
 * @param {Record<string, unknown> | null | undefined} receipt
 */
export function isSuccessfulReceipt(receipt) {
  if (!receipt) return false;
  return String(receipt.status ?? "").toLowerCase() === "0x1";
}

/**
 * @param {{
 *   txHash: string,
 *   fetchImpl?: typeof fetch,
 *   sleepImpl?: (ms: number) => Promise<void>,
 *   runtimeConfig?: ReturnType<typeof getEthereumRuntimeConfig>,
 * }} input
 * @returns {Promise<{ confirmations: number, presence: 'confirmed' | 'missing' | 'unknown' | 'failed', failureReason?: string }>}
 */
export async function fetchTransactionConfirmationState(input) {
  const cfg = input.runtimeConfig ?? getEthereumRuntimeConfig();
  if (!cfg.configured) {
    return { confirmations: 0, presence: "unknown" };
  }

  const txHash = input.txHash.trim();
  if (!txHash) {
    return { confirmations: 0, presence: "missing" };
  }

  try {
    const receipt = await withEthRetry(
      () =>
        jsonRpcCall(cfg.rpcUrl, "eth_getTransactionReceipt", [txHash], {
          fetchImpl: input.fetchImpl,
          apiKey: cfg.apiKey,
        }),
      { sleepImpl: input.sleepImpl },
    );

    if (receipt == null) {
      return { confirmations: 0, presence: "missing" };
    }

    const txBlockHex = receipt.blockNumber;
    const txBlock = Number.parseInt(String(txBlockHex), 16);
    if (!Number.isFinite(txBlock) || txBlock < 0) {
      return { confirmations: 0, presence: "missing" };
    }
    if (!isSuccessfulReceipt(receipt)) {
      return { confirmations: 0, presence: "failed", failureReason: "tx_failed" };
    }

    const latestHex = await withEthRetry(
      () =>
        jsonRpcCall(cfg.rpcUrl, "eth_blockNumber", [], {
          fetchImpl: input.fetchImpl,
          apiKey: cfg.apiKey,
        }),
      { sleepImpl: input.sleepImpl },
    );
    const latest = Number.parseInt(String(latestHex), 16);
    if (!Number.isFinite(latest) || latest < 0) {
      return { confirmations: 0, presence: "unknown" };
    }

    return {
      confirmations: Math.max(0, latest - txBlock + 1),
      presence: "confirmed",
    };
  } catch {
    return { confirmations: 0, presence: "unknown" };
  }
}
