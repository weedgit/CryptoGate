/**
 * TronGrid HTTP helpers for USDT TRC-20 ingest + confirmations (M3-30).
 * No apps/api imports. Fetch is injectable for unit tests.
 */

import { fetchWithTimeout } from "../fetch-timeout.mjs";
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
 * TronGrid 400 "valid account address" — skip this address, keep polling others.
 * @param {unknown} err
 */
function isInvalidTronAddressHttpError(err) {
  if (!err || typeof err !== "object") return false;
  const status = /** @type {{ status?: number, message?: string }} */ (err).status;
  if (status !== 400) return false;
  const message = String(
    /** @type {{ message?: string }} */ (err).message ?? err,
  );
  return /valid account address/i.test(message);
}

/**
 * @param {string} baseUrl
 * @param {string} path
 * @param {{ apiKey?: string, method?: string, body?: unknown, fetchImpl?: typeof fetch }} opts
 */
export async function trongridFetch(baseUrl, path, opts = {}) {
  const url = `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  /** @type {Record<string, string>} */
  const headers = { Accept: "application/json" };
  if (opts.apiKey) headers["TRON-PRO-API-KEY"] = opts.apiKey;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetchWithTimeout(opts.fetchImpl, url, {
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
  const fromAddress = String(row.from ?? "").trim() || undefined;
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
    fromAddress,
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
  const cfg = input.runtimeConfig ?? getTronRuntimeConfig();
  if (!cfg.configured || cfg.nativeAsset) {
    return { transfers: [], mode: "stub", watchedAddressCount: 0 };
  }

  const watched = [...new Set(input.watchedAddresses.map((a) => a.trim()).filter(Boolean))];
  const limit = input.limit ?? 50;
  /** @type {Array<{ toAddress: string, amount: string, txHash: string, asset?: string, network?: string, memoOrTag?: string }>} */
  const transfers = [];

  let skippedInvalidRemote = 0;
  for (const address of watched) {
    const path =
      `/v1/accounts/${encodeURIComponent(address)}/transactions/trc20` +
      `?only_to=true&limit=${limit}` +
      (cfg.contractAddress
        ? `&contract_address=${encodeURIComponent(cfg.contractAddress)}`
        : "");
    let json;
    try {
      json = await withTronRetry(
        () =>
          trongridFetch(cfg.baseUrl, path, {
            apiKey: cfg.apiKey,
            fetchImpl: input.fetchImpl,
          }),
        { sleepImpl: input.sleepImpl },
      );
    } catch (err) {
      // One bad address must not fail the whole network tick (seed / checksum rejects).
      if (isInvalidTronAddressHttpError(err)) {
        skippedInvalidRemote += 1;
        continue;
      }
      throw err;
    }
    const rows = Array.isArray(json?.data) ? json.data : [];
    for (const row of rows) {
      const mapped = mapTrc20Row(/** @type {Record<string, unknown>} */ (row), {
        contractAddress: cfg.contractAddress,
        decimals: cfg.decimals,
        asset: cfg.asset,
        network: cfg.network,
      });
      if (mapped) transfers.push(mapped);
    }
  }

  return {
    transfers,
    mode: "trongrid",
    watchedAddressCount: watched.length,
    skippedInvalidRemote,
  };
}

/**
 * Native TRX transfers via TronGrid account transactions.
 * @param {{
 *   watchedAddresses: string[],
 *   fetchImpl?: typeof fetch,
 *   sleepImpl?: (ms: number) => Promise<void>,
 *   limit?: number,
 *   runtimeConfig?: ReturnType<typeof getTronRuntimeConfig>,
 * }} input
 */
export async function fetchNativeTrxTransfersForAddresses(input) {
  const cfg = input.runtimeConfig ?? getTronRuntimeConfig();
  if (!cfg.configured || !cfg.nativeAsset) {
    return { transfers: [], mode: "stub", watchedAddressCount: 0 };
  }

  const watched = new Set(input.watchedAddresses.map((a) => a.trim()).filter(Boolean));
  const limit = input.limit ?? 50;
  /** @type {Array<{ toAddress: string, amount: string, txHash: string, asset?: string, network?: string }>} */
  const transfers = [];
  let skippedInvalidRemote = 0;

  for (const address of watched) {
    const path =
      `/v1/accounts/${encodeURIComponent(address)}/transactions?only_to=true&limit=${limit}`;
    let json;
    try {
      json = await withTronRetry(
        () =>
          trongridFetch(cfg.baseUrl, path, {
            apiKey: cfg.apiKey,
            fetchImpl: input.fetchImpl,
          }),
        { sleepImpl: input.sleepImpl },
      );
    } catch (err) {
      if (isInvalidTronAddressHttpError(err)) {
        skippedInvalidRemote += 1;
        continue;
      }
      throw err;
    }
    const rows = Array.isArray(json?.data) ? json.data : [];
    for (const row of rows) {
      const raw = /** @type {Record<string, unknown>} */ (row.raw_data ?? {});
      const contracts = Array.isArray(raw.contract) ? raw.contract : [];
      const first = /** @type {Record<string, unknown>} */ (contracts[0] ?? {});
      if (String(first.type ?? "") !== "TransferContract") continue;

      const value = /** @type {Record<string, unknown>} */ (
        /** @type {Record<string, unknown>} */ (first.parameter ?? {}).value ?? {}
      );
      const amountSun = Number(value.amount);
      const toAddress = String(row.toAddress ?? value.to_address ?? "").trim();
      const ownerRaw = value.owner_address ?? row.from ?? row.ownerAddress;
      const fromAddress = String(ownerRaw ?? "").trim() || undefined;
      const txHash = String(row.txID ?? row.transaction_id ?? "").trim();
      if (!toAddress || !watched.has(toAddress) || !Number.isFinite(amountSun) || !txHash) {
        continue;
      }

      let amount;
      try {
        amount = minorToMajor(String(amountSun), cfg.decimals);
      } catch {
        continue;
      }

      transfers.push({
        toAddress,
        fromAddress,
        amount,
        txHash,
        asset: cfg.asset,
        network: cfg.network,
        memoOrTag: undefined,
      });
    }
  }

  return {
    transfers,
    mode: "trongrid",
    watchedAddressCount: watched.size,
    skippedInvalidRemote,
  };
}

/**
 * Confirmations = current block − tx block (floored at 0).
 * Presence distinguishes reorg (tx gone) from RPC failure (M4-21).
 * @param {{ txHash: string, fetchImpl?: typeof fetch, sleepImpl?: (ms: number) => Promise<void> }} input
 * @returns {Promise<{ confirmations: number, presence: 'confirmed' | 'missing' | 'unknown' }>}
 */
export async function fetchTransactionConfirmationState(input) {
  const cfg = getTronRuntimeConfig(input?.asset, input?.network);
  if (!cfg.configured) {
    return { confirmations: 0, presence: "unknown" };
  }

  const txHash = input.txHash.trim();
  if (!txHash) {
    return { confirmations: 0, presence: "missing" };
  }

  try {
    const info = await withTronRetry(
      () =>
        trongridFetch(cfg.baseUrl, "/wallet/gettransactioninfobyid", {
          apiKey: cfg.apiKey,
          fetchImpl: input.fetchImpl,
          body: { value: txHash },
        }),
      { sleepImpl: input.sleepImpl },
    );

    // Empty object / no block → tx not in current tip view (dropped or never indexed).
    const txBlock = Number(info?.blockNumber ?? info?.block_number);
    if (!Number.isFinite(txBlock) || txBlock <= 0) {
      const empty =
        info == null ||
        (typeof info === "object" && Object.keys(info).length === 0);
      return {
        confirmations: 0,
        presence: empty || !Number.isFinite(txBlock) ? "missing" : "missing",
      };
    }

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
    if (!Number.isFinite(current) || current <= 0) {
      return { confirmations: 0, presence: "unknown" };
    }

    return {
      confirmations: Math.max(0, current - txBlock + 1),
      presence: "confirmed",
    };
  } catch {
    return { confirmations: 0, presence: "unknown" };
  }
}

/**
 * @param {{ txHash: string, fetchImpl?: typeof fetch, sleepImpl?: (ms: number) => Promise<void> }} input
 * @returns {Promise<number>}
 */
export async function fetchTransactionConfirmations(input) {
  const state = await fetchTransactionConfirmationState(input);
  return state.confirmations;
}
