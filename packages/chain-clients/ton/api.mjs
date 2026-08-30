/**
 * TON jetton ingest via TonAPI-compatible HTTP (TON_RPC_URL, default tonapi.io).
 */

import { fetchWithTimeout } from "../fetch-timeout.mjs";
import { minorToMajor } from "../tron/amount.mjs";
import { getTonRuntimeConfig } from "./config.mjs";

/**
 * @param {string} baseUrl
 * @param {string} path
 * @param {{ apiKey?: string, fetchImpl?: typeof fetch }} opts
 */
export async function tonApiFetch(baseUrl, path, opts = {}) {
  const url = `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  /** @type {Record<string, string>} */
  const headers = { Accept: "application/json" };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

  const res = await fetchWithTimeout(opts.fetchImpl, url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`ton api HTTP ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * @param {Record<string, unknown>} event
 * @param {{ jettonMaster: string, decimals: number, asset: string, network: string, watched: Set<string> }} cfg
 */
export function mapJettonTransferEvent(event, cfg) {
  const actions = Array.isArray(event.actions) ? event.actions : [];
  for (const action of actions) {
    const jetton = /** @type {Record<string, unknown>} */ (action.JettonTransfer ?? action.jetton_transfer ?? {});
    if (!jetton || typeof jetton !== "object") continue;

    const master = String(
      jetton.jetton?.address ?? jetton.master ?? jetton.jetton_master ?? "",
    );
    if (cfg.jettonMaster && master && master !== cfg.jettonMaster) continue;

    const recipient = String(jetton.recipient?.address ?? jetton.recipient ?? "").trim();
    if (!recipient || !cfg.watched.has(recipient)) continue;

    const amountRaw = jetton.amount ?? jetton.quantity;
    if (amountRaw === undefined || amountRaw === null) continue;

    const txHash = String(event.event_id ?? event.lt ?? event.transaction_hash ?? "").trim();
    if (!txHash) continue;

    let amount;
    try {
      amount = minorToMajor(String(amountRaw), cfg.decimals);
    } catch {
      continue;
    }

    return {
      toAddress: recipient,
      amount,
      txHash,
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
 *   runtimeConfig?: ReturnType<typeof getTonRuntimeConfig>,
 *   pollMode?: string,
 * }} input
 */
export async function fetchJettonTransfersForAddresses(input) {
  const cfg = input.runtimeConfig ?? getTonRuntimeConfig();
  const pollMode = input.pollMode ?? "ton-api";
  if (!cfg.configured || !cfg.jettonMaster) {
    return { transfers: [], mode: "stub", watchedAddressCount: 0 };
  }

  const watched = new Set(input.watchedAddresses.map((a) => a.trim()).filter(Boolean));
  if (watched.size === 0) {
    return { transfers: [], mode: pollMode, watchedAddressCount: 0 };
  }

  /** @type {Array<{ toAddress: string, amount: string, txHash: string, asset?: string, network?: string }>} */
  const transfers = [];

  for (const address of watched) {
    const path = `/v2/accounts/${encodeURIComponent(address)}/events?limit=${cfg.eventLimit}`;
    const json = await tonApiFetch(cfg.baseUrl, path, {
      apiKey: cfg.apiKey,
      fetchImpl: input.fetchImpl,
    });
    const events = Array.isArray(json?.events) ? json.events : [];
    for (const event of events) {
      const mapped = mapJettonTransferEvent(
        /** @type {Record<string, unknown>} */ (event),
        {
          jettonMaster: cfg.jettonMaster,
          decimals: cfg.decimals,
          asset: cfg.asset,
          network: cfg.network,
          watched,
        },
      );
      if (mapped) transfers.push(mapped);
    }
  }

  return { transfers, mode: pollMode, watchedAddressCount: watched.size };
}

/**
 * @param {{ txHash: string, fetchImpl?: typeof fetch, runtimeConfig?: ReturnType<typeof getTonRuntimeConfig> }} input
 */
export async function fetchTransactionConfirmationState(input) {
  const cfg = input.runtimeConfig ?? getTonRuntimeConfig();
  if (!cfg.configured) return { confirmations: 0, presence: "unknown" };

  const txHash = input.txHash.trim();
  if (!txHash) return { confirmations: 0, presence: "missing" };

  try {
    const path = `/v2/traces/${encodeURIComponent(txHash)}`;
    const json = await tonApiFetch(cfg.baseUrl, path, {
      apiKey: cfg.apiKey,
      fetchImpl: input.fetchImpl,
    });
    if (!json || (typeof json === "object" && Object.keys(json).length === 0)) {
      return { confirmations: 0, presence: "missing" };
    }
    const conf = Number(json?.transaction?.success ?? json?.confirms);
    if (json?.transaction?.success === false) {
      return { confirmations: 0, presence: "missing" };
    }
    return {
      confirmations: Number.isFinite(conf) && conf > 0 ? conf : cfg.requiredConfirmations,
      presence: "confirmed",
    };
  } catch (err) {
    if (err?.status === 404) return { confirmations: 0, presence: "missing" };
    return { confirmations: 0, presence: "unknown" };
  }
}
