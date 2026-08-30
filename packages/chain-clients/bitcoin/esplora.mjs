/**
 * Bitcoin watch-only ingest via Esplora-compatible REST (Blockstream default).
 */

import { fetchWithTimeout } from "../fetch-timeout.mjs";
import { minorToMajor } from "../tron/amount.mjs";
import { getBitcoinRuntimeConfig } from "./config.mjs";

/**
 * @param {string} baseUrl
 * @param {string} path
 * @param {{ apiKey?: string, fetchImpl?: typeof fetch }} opts
 */
export async function esploraFetch(baseUrl, path, opts = {}) {
  const url = `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  /** @type {Record<string, string>} */
  const headers = { Accept: "application/json" };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

  const res = await fetchWithTimeout(opts.fetchImpl, url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`bitcoin api HTTP ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * @param {Record<string, unknown>} tx
 * @param {string} watchedAddress
 * @param {{ decimals: number, asset: string, network: string }} cfg
 */
export function mapBitcoinOutput(tx, watchedAddress, cfg) {
  const txid = String(tx.txid ?? "").trim();
  if (!txid) return null;

  const vout = Array.isArray(tx.vout) ? tx.vout : [];
  let totalSats = 0n;
  for (const out of vout) {
    const addr = String(out.scriptpubkey_address ?? out.address ?? "").trim();
    if (addr !== watchedAddress) continue;
    const value = out.value;
    if (typeof value === "number" && Number.isFinite(value)) {
      totalSats += BigInt(Math.trunc(value));
    } else if (typeof value === "string" && /^\d+$/.test(value)) {
      totalSats += BigInt(value);
    }
  }
  if (totalSats <= 0n) return null;

  let amount;
  try {
    amount = minorToMajor(totalSats.toString(), cfg.decimals);
  } catch {
    return null;
  }

  return {
    toAddress: watchedAddress,
    amount,
    txHash: txid,
    asset: cfg.asset,
    network: cfg.network,
    memoOrTag: undefined,
  };
}

/**
 * @param {{
 *   watchedAddresses: string[],
 *   fetchImpl?: typeof fetch,
 *   runtimeConfig?: ReturnType<typeof getBitcoinRuntimeConfig>,
 *   pollMode?: string,
 * }} input
 */
export async function fetchBitcoinTransfersForAddresses(input) {
  const cfg = input.runtimeConfig ?? getBitcoinRuntimeConfig();
  const pollMode = input.pollMode ?? "bitcoin-api";
  if (!cfg.configured) {
    return { transfers: [], mode: "stub", watchedAddressCount: 0 };
  }

  const watched = [...new Set(input.watchedAddresses.map((a) => a.trim()).filter(Boolean))];
  if (watched.length === 0) {
    return { transfers: [], mode: pollMode, watchedAddressCount: 0 };
  }

  /** @type {Array<{ toAddress: string, amount: string, txHash: string, asset?: string, network?: string }>} */
  const transfers = [];

  for (const address of watched) {
    const txs = await esploraFetch(
      cfg.baseUrl,
      `/address/${encodeURIComponent(address)}/txs`,
      { apiKey: cfg.apiKey, fetchImpl: input.fetchImpl },
    );
    const rows = Array.isArray(txs) ? txs.slice(0, cfg.txLimit) : [];
    for (const tx of rows) {
      const mapped = mapBitcoinOutput(
        /** @type {Record<string, unknown>} */ (tx),
        address,
        { decimals: cfg.decimals, asset: cfg.asset, network: cfg.network },
      );
      if (mapped) transfers.push(mapped);
    }
  }

  return { transfers, mode: pollMode, watchedAddressCount: watched.length };
}

/**
 * @param {{ txHash: string, fetchImpl?: typeof fetch, runtimeConfig?: ReturnType<typeof getBitcoinRuntimeConfig> }} input
 */
export async function fetchTransactionConfirmationState(input) {
  const cfg = input.runtimeConfig ?? getBitcoinRuntimeConfig();
  if (!cfg.configured) return { confirmations: 0, presence: "unknown" };

  const txHash = input.txHash.trim();
  if (!txHash) return { confirmations: 0, presence: "missing" };

  try {
    const tx = await esploraFetch(cfg.baseUrl, `/tx/${encodeURIComponent(txHash)}`, {
      apiKey: cfg.apiKey,
      fetchImpl: input.fetchImpl,
    });
    if (!tx) return { confirmations: 0, presence: "missing" };

    const status = /** @type {Record<string, unknown>} */ (tx.status ?? {});
    if (status.confirmed !== true) {
      return { confirmations: 0, presence: "missing" };
    }

    const tipHeight = Number(
      await esploraFetch(cfg.baseUrl, "/blocks/tip/height", {
        apiKey: cfg.apiKey,
        fetchImpl: input.fetchImpl,
      }),
    );
    const blockHeight = Number(status.block_height);
    if (!Number.isFinite(tipHeight) || !Number.isFinite(blockHeight)) {
      return { confirmations: 0, presence: "unknown" };
    }

    return {
      confirmations: Math.max(0, tipHeight - blockHeight + 1),
      presence: "confirmed",
    };
  } catch (err) {
    if (err?.status === 404) return { confirmations: 0, presence: "missing" };
    return { confirmations: 0, presence: "unknown" };
  }
}
