/**
 * Ethereum JSON-RPC — USDT ERC-20 Transfer logs + confirmations (M3-32).
 */

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
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this runtime");
  }
  /** @type {Record<string, string>} */
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

  const res = await fetchImpl(rpcUrl, {
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

/**
 * @param {{
 *   watchedAddresses: string[],
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

  const fromBlock = Math.max(0, latest - cfg.blockLookback);
  /** @type {Array<{ toAddress: string, amount: string, txHash: string, asset?: string, network?: string, memoOrTag?: string }>} */
  const transfers = [];

  for (const address of watched) {
    const toTopic = padAddressTopic(address);
    if (!toTopic) continue;

    const logs = await withEthRetry(
      () =>
        jsonRpcCall(
          cfg.rpcUrl,
          "eth_getLogs",
          [
            {
              address: cfg.usdtContractAddress,
              fromBlock: toHexBlock(fromBlock),
              toBlock: "latest",
              topics: [ERC20_TRANSFER_TOPIC, null, toTopic],
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
      if (mapped) transfers.push(mapped);
    }
  }

  return {
    transfers,
    mode: pollMode,
    watchedAddressCount: watched.length,
  };
}

/**
 * Scan recent blocks for native ETH transfers to watched addresses.
 * @param {{
 *   watchedAddresses: string[],
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

  const watchedSet = new Set(
    input.watchedAddresses.map((a) => a.trim().toLowerCase()).filter(Boolean),
  );
  if (watchedSet.size === 0) {
    return { transfers: [], mode: pollMode, watchedAddressCount: 0 };
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
    throw new Error("eth_blockNumber returned invalid block");
  }

  const fromBlock = Math.max(0, latest - cfg.blockLookback);
  /** @type {Array<{ toAddress: string, amount: string, txHash: string, asset?: string, network?: string }>} */
  const transfers = [];

  for (let blockNum = fromBlock; blockNum <= latest; blockNum += 1) {
    const block = await withEthRetry(
      () =>
        jsonRpcCall(cfg.rpcUrl, "eth_getBlockByNumber", [toHexBlock(blockNum), true], {
          fetchImpl: input.fetchImpl,
          apiKey: cfg.apiKey,
        }),
      { sleepImpl: input.sleepImpl },
    );
    const txs = Array.isArray(block?.transactions) ? block.transactions : [];
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
      transfers.push({
        toAddress: to,
        amount,
        txHash,
        asset: cfg.asset,
        network: cfg.network,
      });
    }
  }

  return { transfers, mode: pollMode, watchedAddressCount: watchedSet.size };
}

/**
 * @param {{
 *   txHash: string,
 *   fetchImpl?: typeof fetch,
 *   sleepImpl?: (ms: number) => Promise<void>,
 *   runtimeConfig?: ReturnType<typeof getEthereumRuntimeConfig>,
 * }} input
 * @returns {Promise<{ confirmations: number, presence: 'confirmed' | 'missing' | 'unknown' }>}
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
