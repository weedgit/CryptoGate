/**
 * TronGrid HTTP helpers for USDT TRC-20 ingest + confirmations (M3-30).
 * No apps/api imports. Fetch is injectable for unit tests.
 */

import { minorToMajor } from "./amount.mjs";
import {
  DEFAULT_TRON_MAX_ATTEMPTS,
  isRetryableTronStatus,
  parseRetryAfterMs,
  sleepMs,
  tronBackoffMs,
} from "./backoff.mjs";
import { getTronRuntimeConfig } from "./config.mjs";

/**
 * @param {string} baseUrl
 * @param {string} path
 * @param {{ apiKey?: string, method?: string, body?: unknown, fetchImpl?: typeof fetch }} opts
 */
export async function trongridFetch(baseUrl, path, opts = {}) {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this runtime");
  }
  const url = `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  /** @type {Record<string, string>} */
  const headers = { Accept: "application/json" };
  if (opts.apiKey) headers["TRON-PRO-API-KEY"] = opts.apiKey;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetchImpl(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`trongrid HTTP ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    err.retryAfterMs = parseRetryAfterMs(res.headers);
    throw err;
  }
  return res.json();
}

/**
 * Retry retryable TronGrid HTTP (429 / 5xx) with exponential backoff.
 * @param {() => Promise<unknown>} fn
 * @param {{ maxAttempts?: number, sleepImpl?: (ms: number) => Promise<void> }} [opts]
 */
export async function withTronRetry(fn, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_TRON_MAX_ATTEMPTS;
  const sleepImpl = opts.sleepImpl;
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.status;
      const retryable = isRetryableTronStatus(status);
      if (!retryable || attempt === maxAttempts - 1) throw err;
      const delay = tronBackoffMs(attempt, { retryAfterMs: err.retryAfterMs });
      await sleepMs(delay, sleepImpl);
    }
  }
  throw lastErr;
}

/**
 * Map one TronGrid TRC-20 row → watcher transfer shape.
 * @param {Record<string, unknown>} row
 * @param {{ contractAddress: string, decimals: number, network?: string, asset?: string }} cfg
 */
export function mapTrc20Row(row, cfg) {
  const token = /** @type {Record<string, unknown>} */ (row.token_info ?? {});
  const tokenAddr = String(token.address ?? "").trim();
  if (
    cfg.contractAddress &&
    tokenAddr &&
    tokenAddr.toLowerCase() !== cfg.contractAddress.toLowerCase()
  ) {
    return null;
  }

  const txHash = String(row.transaction_id ?? row.txID ?? "").trim();
  const toAddress = String(row.to ?? "").trim();
  const value = row.value;
  if (!txHash || !toAddress || value === undefined || value === null) {
    return null;
  }

  const decimals =
    typeof token.decimals === "number" && Number.isFinite(token.decimals)
      ? token.decimals
      : cfg.decimals;

  let amount;
  try {
    amount = minorToMajor(/** @type {string | number} */ (value), decimals);
  } catch {
    return null;
  }

  return {
    toAddress,
    amount,
    txHash,
    asset: cfg.asset ?? "USDT",
    network: cfg.network ?? "tron",
    memoOrTag: undefined,
  };
}

/**
 * @param {{
 *   watchedAddresses: string[],
 *   fetchImpl?: typeof fetch,
 *   limit?: number,
 * }} input
 */
export async function fetchTrc20TransfersForAddresses(input) {
  const cfg = getTronRuntimeConfig();
  if (!cfg.configured) {
    return { transfers: [], mode: "stub", watchedAddressCount: 0 };
  }

  const watched = [...new Set(input.watchedAddresses.map((a) => a.trim()).filter(Boolean))];
  const limit = input.limit ?? 50;
  /** @type {Array<{ toAddress: string, amount: string, txHash: string, asset?: string, network?: string, memoOrTag?: string }>} */
  const transfers = [];

  for (const address of watched) {
    const path =
      `/v1/accounts/${encodeURIComponent(address)}/transactions/trc20` +
      `?only_to=true&limit=${limit}` +
      `&contract_address=${encodeURIComponent(cfg.usdtContractAddress)}`;
    const json = await withTronRetry(
      () =>
        trongridFetch(cfg.baseUrl, path, {
          apiKey: cfg.apiKey,
          fetchImpl: input.fetchImpl,
        }),
      { sleepImpl: input.sleepImpl },
    );
    const rows = Array.isArray(json?.data) ? json.data : [];
    for (const row of rows) {
      const mapped = mapTrc20Row(/** @type {Record<string, unknown>} */ (row), {
        contractAddress: cfg.usdtContractAddress,
        decimals: cfg.decimals,
        asset: "USDT",
        network: "tron",
      });
      if (mapped) transfers.push(mapped);
    }
  }

  return {
    transfers,
    mode: "trongrid",
    watchedAddressCount: watched.length,
  };
}

/**
 * Confirmations = current block − tx block (floored at 0).
 * @param {{ txHash: string, fetchImpl?: typeof fetch }} input
 * @returns {Promise<number>}
 */
export async function fetchTransactionConfirmations(input) {
  const cfg = getTronRuntimeConfig();
  if (!cfg.configured) return 0;

  const txHash = input.txHash.trim();
  if (!txHash) return 0;

  const info = await withTronRetry(
    () =>
      trongridFetch(cfg.baseUrl, "/wallet/gettransactioninfobyid", {
        apiKey: cfg.apiKey,
        fetchImpl: input.fetchImpl,
        body: { value: txHash },
      }),
    { sleepImpl: input.sleepImpl },
  );

  const txBlock = Number(info?.blockNumber ?? info?.block_number);
  if (!Number.isFinite(txBlock) || txBlock <= 0) return 0;

  const now = await withTronRetry(
    () =>
      trongridFetch(cfg.baseUrl, "/wallet/getnowblock", {
        apiKey: cfg.apiKey,
        fetchImpl: input.fetchImpl,
        body: {},
      }),
    { sleepImpl: input.sleepImpl },
  );
  const current = Number(now?.block_header?.raw_data?.number);
  if (!Number.isFinite(current) || current <= 0) return 0;

  return Math.max(0, current - txBlock);
}
