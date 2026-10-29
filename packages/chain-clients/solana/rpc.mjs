/**
 * Solana JSON-RPC — SPL token transfers to watched owner addresses.
 */

import { fetchWithTimeout } from "../fetch-timeout.mjs";
import { minorToMajor } from "../tron/amount.mjs";
import { getSolanaRuntimeConfig } from "./config.mjs";

/**
 * @param {string} rpcUrl
 * @param {string} method
 * @param {unknown[]} params
 * @param {{ fetchImpl?: typeof fetch, apiKey?: string }} opts
 */
export async function solanaRpcCall(rpcUrl, method, params, opts = {}) {
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
    const err = new Error(`solana rpc HTTP ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  if (body.error) {
    const err = new Error(`solana rpc error: ${body.error.message ?? JSON.stringify(body.error)}`);
    err.status = 502;
    throw err;
  }
  return body.result;
}

/**
 * Parse incoming SPL amount for a watched owner from a parsed transaction.
 * @param {Record<string, unknown>} tx
 * @param {{ owner: string, mint: string, decimals: number, asset: string, network: string }} cfg
 */
export function mapSplTransferFromTransaction(tx, cfg) {
  const sig = String(tx?.transaction?.signatures?.[0] ?? "").trim();
  const meta = /** @type {Record<string, unknown>} */ (tx?.meta ?? {});
  const pre = Array.isArray(meta.preTokenBalances) ? meta.preTokenBalances : [];
  const post = Array.isArray(meta.postTokenBalances) ? meta.postTokenBalances : [];
  if (!sig) return null;
  if (meta.err != null) return null;

  const preByIdx = new Map();
  for (const row of pre) {
    const idx = Number(row.accountIndex);
    if (Number.isFinite(idx)) preByIdx.set(idx, row);
  }

  for (const row of post) {
    if (String(row.mint ?? "") !== cfg.mint) continue;
    if (String(row.owner ?? "") !== cfg.owner) continue;
    const idx = Number(row.accountIndex);
    const postAmt = BigInt(String(row.uiTokenAmount?.amount ?? "0"));
    const preRow = Number.isFinite(idx) ? preByIdx.get(idx) : null;
    const preAmt = BigInt(String(preRow?.uiTokenAmount?.amount ?? "0"));
    if (postAmt <= preAmt) continue;
    const delta = postAmt - preAmt;
    let amount;
    try {
      amount = minorToMajor(delta.toString(), cfg.decimals);
    } catch {
      return null;
    }
    const blockTime = Number(tx?.blockTime);
    return {
      toAddress: cfg.owner,
      amount,
      txHash: sig,
      asset: cfg.asset,
      network: cfg.network,
      memoOrTag: undefined,
      blockTimestampMs: Number.isFinite(blockTime) && blockTime > 0 ? blockTime * 1000 : undefined,
    };
  }
  return null;
}

/** Signature pages read per token account per poll. */
export const SOLANA_MAX_SIGNATURE_PAGES = 3;
const DECODED_CACHE_MAX = 10_000;
/**
 * signature|owner → decoded transfer (or null). A confirmed transaction never changes, so
 * each signature is fetched once instead of on every tick (review M4 / M9).
 * @type {Map<string, object | null>}
 */
const decodedBySignature = new Map();

export function resetSolanaSignatureCache() {
  decodedBySignature.clear();
}

/**
 * Signatures for one account back to `sinceMs` (oldest open order), paging with `before`
 * instead of reading only the newest `limit` (review M4).
 * @param {string} account
 * @param {number | undefined} sinceMs
 * @param {ReturnType<typeof getSolanaRuntimeConfig>} cfg
 * @param {{ fetchImpl?: typeof fetch }} input
 */
async function signaturesSince(account, sinceMs, cfg, input) {
  const sinceSec = Number.isFinite(sinceMs) ? Math.floor(Number(sinceMs) / 1000) - 300 : null;
  const out = [];
  let before;
  for (let page = 0; page < SOLANA_MAX_SIGNATURE_PAGES; page += 1) {
    const sigs = await solanaRpcCall(
      cfg.rpcUrl,
      "getSignaturesForAddress",
      [account, { limit: cfg.signatureLimit, ...(before ? { before } : {}) }],
      { fetchImpl: input.fetchImpl, apiKey: cfg.apiKey },
    );
    const rows = Array.isArray(sigs) ? sigs : [];
    out.push(...rows);
    const last = rows[rows.length - 1];
    if (rows.length < cfg.signatureLimit || !last?.signature) break;
    if (sinceSec === null) break;
    if (Number.isFinite(last.blockTime) && last.blockTime < sinceSec) break;
    before = last.signature;
  }
  return out;
}

/**
 * @param {{
 *   watchedAddresses: string[],
 *   addressSinceMs?: Record<string, number>,
 *   fetchImpl?: typeof fetch,
 *   runtimeConfig?: ReturnType<typeof getSolanaRuntimeConfig>,
 *   pollMode?: string,
 * }} input
 */
export async function fetchSplTransfersForAddresses(input) {
  const cfg = input.runtimeConfig ?? getSolanaRuntimeConfig();
  const pollMode = input.pollMode ?? "solana-rpc";
  if (!cfg.configured || !cfg.mintAddress) {
    return { transfers: [], mode: "stub", watchedAddressCount: 0 };
  }

  const watched = [...new Set(input.watchedAddresses.map((a) => a.trim()).filter(Boolean))];
  if (watched.length === 0) {
    return { transfers: [], mode: pollMode, watchedAddressCount: 0 };
  }

  /** @type {Array<{ toAddress: string, amount: string, txHash: string, asset?: string, network?: string }>} */
  const transfers = [];

  for (const owner of watched) {
    const tokenAccounts = await solanaRpcCall(
      cfg.rpcUrl,
      "getTokenAccountsByOwner",
      [owner, { mint: cfg.mintAddress }, { encoding: "jsonParsed" }],
      { fetchImpl: input.fetchImpl, apiKey: cfg.apiKey },
    );
    const values = Array.isArray(tokenAccounts?.value) ? tokenAccounts.value : [];
    const accounts = values.map((v) => String(v?.pubkey ?? "")).filter(Boolean);
    if (accounts.length === 0) accounts.push(owner);

    for (const account of accounts) {
      const rows = await signaturesSince(account, input.addressSinceMs?.[owner], cfg, input);
      for (const row of rows) {
        const signature = String(row?.signature ?? "").trim();
        if (!signature) continue;
        // Failed transactions never credit (H4); skip them without a getTransaction call.
        if (row?.err) continue;
        const cacheKey = `${signature}|${owner}|${cfg.mintAddress}`;
        if (decodedBySignature.has(cacheKey)) {
          const cached = decodedBySignature.get(cacheKey);
          if (cached) transfers.push(cached);
          continue;
        }
        const tx = await solanaRpcCall(
          cfg.rpcUrl,
          "getTransaction",
          [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
          { fetchImpl: input.fetchImpl, apiKey: cfg.apiKey },
        );
        const mapped = mapSplTransferFromTransaction(
          /** @type {Record<string, unknown>} */ (tx),
          {
            owner,
            mint: cfg.mintAddress,
            decimals: cfg.decimals,
            asset: cfg.asset,
            network: cfg.network,
          },
        );
        // Only finalized/confirmed transactions are returned, so the decode is stable.
        if (tx) {
          decodedBySignature.set(cacheKey, mapped);
          if (decodedBySignature.size > DECODED_CACHE_MAX) {
            decodedBySignature.delete(decodedBySignature.keys().next().value);
          }
        }
        if (mapped) transfers.push(mapped);
      }
    }
  }

  return { transfers, mode: pollMode, watchedAddressCount: watched.length };
}

/**
 * @param {{
 *   txHash: string,
 *   fetchImpl?: typeof fetch,
 *   runtimeConfig?: ReturnType<typeof getSolanaRuntimeConfig>,
 * }} input
 */
export async function fetchTransactionConfirmationState(input) {
  const cfg = input.runtimeConfig ?? getSolanaRuntimeConfig();
  if (!cfg.configured) return { confirmations: 0, presence: "unknown" };

  const txHash = input.txHash.trim();
  if (!txHash) return { confirmations: 0, presence: "missing" };

  try {
    const tx = await solanaRpcCall(
      cfg.rpcUrl,
      "getTransaction",
      [txHash, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
      { fetchImpl: input.fetchImpl, apiKey: cfg.apiKey },
    );
    if (!tx) return { confirmations: 0, presence: "missing" };

    const slot = Number(tx?.slot);
    if (!Number.isFinite(slot) || slot <= 0) {
      return { confirmations: 0, presence: "missing" };
    }

    const status = await solanaRpcCall(
      cfg.rpcUrl,
      "getSignatureStatuses",
      [[txHash], { searchTransactionHistory: true }],
      { fetchImpl: input.fetchImpl, apiKey: cfg.apiKey },
    );
    const value = status?.value?.[0];
    if (value?.err || tx?.meta?.err) {
      return { confirmations: 0, presence: "failed", failureReason: "tx_failed" };
    }
    const conf = value?.confirmations;
    if (typeof conf === "number" && conf >= 0) {
      return { confirmations: conf, presence: "confirmed" };
    }

    const currentSlot = Number(
      await solanaRpcCall(cfg.rpcUrl, "getSlot", [], {
        fetchImpl: input.fetchImpl,
        apiKey: cfg.apiKey,
      }),
    );
    if (!Number.isFinite(currentSlot)) {
      return { confirmations: 0, presence: "unknown" };
    }
    return {
      confirmations: Math.max(0, currentSlot - slot + 1),
      presence: "confirmed",
    };
  } catch {
    return { confirmations: 0, presence: "unknown" };
  }
}
