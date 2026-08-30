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
    return {
      toAddress: cfg.owner,
      amount,
      txHash: sig,
      asset: cfg.asset,
      network: cfg.network,
      memoOrTag: undefined,
    };
  }
  return null;
}

/**
 * @param {{
 *   watchedAddresses: string[],
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
      const sigs = await solanaRpcCall(
        cfg.rpcUrl,
        "getSignaturesForAddress",
        [account, { limit: cfg.signatureLimit }],
        { fetchImpl: input.fetchImpl, apiKey: cfg.apiKey },
      );
      const rows = Array.isArray(sigs) ? sigs : [];
      for (const row of rows) {
        const signature = String(row?.signature ?? "").trim();
        if (!signature) continue;
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
    if (value?.err) return { confirmations: 0, presence: "missing" };
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
