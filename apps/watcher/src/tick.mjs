/**
 * One watcher iteration.
 * M3-40: poll transfers for watched open-order addresses.
 * M3-41: match inbound transfers → payment_orders.
 * M3-42: advance verifying/confirmed → completed when confirmations met.
 * Multi-network: poll every open asset+network scope (WATCHER_MULTI_NETWORK=true default).
 */
import { healthCheck as ethHealthCheck } from "@paymentgate/chain-clients/ethereum";
import { healthCheck as solanaHealthCheck } from "@paymentgate/chain-clients/solana";
import { healthCheck as tronHealthCheck } from "@paymentgate/chain-clients/tron";
import { resolveWatchScopes } from "./config.mjs";
import { loadChainClient } from "./chain-client.mjs";
import { processConfirmationBatch } from "./confirm/advance.mjs";
import { getWatcherPool } from "./db/pool.mjs";
import { persistTickHeartbeats } from "./health/heartbeat-store.mjs";
import {
  detectionLatencyFromBlockMs,
  selectAddressesForPoll,
} from "./ingest/address-budget.mjs";
import {
  getScopeCursor,
  scopeCursorKey,
  setScopeCursor,
} from "./ingest/scope-cursors.mjs";
import { drainTransferHints } from "./ingest/transfer-hints.mjs";
import { mapPool } from "./map-pool.mjs";
import { processTransferBatch } from "./match/inbound.mjs";
import {
  applyConfirmationUpdate,
  applyMatchResult,
  listAddressesNeedingFromBackfill,
  listAddressesNeedingReceivedBackfill,
  listDistinctWatchScopes,
  listKnownTxHashes,
  listOpenOrdersForMatch,
  listOrdersAwaitingConfirmations,
  listAllOrdersAwaitingConfirmations,
  listOrdersByReceiveAddresses,
  countWatcherWorkload,
  patchMissingFromAddresses,
  patchMissingReceivedAmounts,
} from "./orders/order-store.mjs";

/**
 * @param {import("pg").Pool} pool
 * @param {{ asset: string, network: string }} filter
 * @param {{
 *   confirmConcurrency?: number,
 *   addressPollBudget?: number,
 *   matchOnly?: boolean,
 * }} [opts]
 */
async function ingestScope(pool, filter, opts = {}) {
  const confirmConcurrency = opts.confirmConcurrency ?? 8;
  const addressPollBudget = opts.addressPollBudget ?? 64;
  const matchOnly = Boolean(opts.matchOnly);
  const chain = await loadChainClient(filter.network);

  const openOrders = await listOpenOrdersForMatch(pool, filter);
  const fromBackfillAddresses = await listAddressesNeedingFromBackfill(
    pool,
    filter,
  );
  const receivedBackfillAddresses = await listAddressesNeedingReceivedBackfill(
    pool,
    filter,
  );
  const cursorKey = scopeCursorKey(filter.asset, filter.network);
  const selected = selectAddressesForPoll({
    orders: openOrders,
    extraAddresses: [...fromBackfillAddresses, ...receivedBackfillAddresses],
    budget: addressPollBudget,
    cursor: getScopeCursor(cursorKey),
  });
  setScopeCursor(cursorKey, selected.nextCursor);
  const watchedAddresses = selected.addresses;

  const crossNet = await listOrdersByReceiveAddresses(pool, {
    addresses: watchedAddresses,
  });
  const byId = new Map();
  // Keep full open-order set for matching (amount collisions, Mode B) even when
  // only a budgeted address subset was polled for transfers.
  for (const o of [...openOrders, ...crossNet]) {
    byId.set(o.orderId, o);
  }
  const matchCandidates = [...byId.values()];
  const pendingPaymentOrders = openOrders.filter(
    (o) => o.status === "pending_payment",
  ).length;

  const polled = await chain.listRecentTransfers({
    ...filter,
    watchedAddresses,
  });

  const hinted = drainTransferHints({
    asset: filter.asset,
    network: filter.network,
    watchedAddresses,
  });
  if (hinted.length > 0) {
    const seen = new Set(
      polled.transfers.map((t) => String(t.txHash ?? "").trim()).filter(Boolean),
    );
    let mergedHints = 0;
    for (const h of hinted) {
      const hash = String(h.txHash ?? "").trim();
      if (!hash || seen.has(hash)) continue;
      seen.add(hash);
      polled.transfers.push(h);
      mergedHints += 1;
    }
    polled.transferHintsMerged = mergedHints;
  } else {
    polled.transferHintsMerged = 0;
  }

  const known = await listKnownTxHashes(pool, {
    network: filter.network,
    txHashes: polled.transfers.map((t) => t.txHash).filter(Boolean),
  });

  const nowMs = Date.now();
  const matchOutcomes = await processTransferBatch({
    transfers: polled.transfers.map((t) => ({
      toAddress: t.toAddress,
      fromAddress: t.fromAddress,
      amount: t.amount,
      asset: t.asset ?? filter.asset,
      network: t.network ?? filter.network,
      txHash: t.txHash,
      memoOrTag: t.memoOrTag,
      blockTimestampMs: t.blockTimestampMs,
    })),
    openOrders: matchCandidates,
    knownTxHashes: known,
    apply: (args) => applyMatchResult(pool, args),
  });

  for (const outcome of matchOutcomes) {
    if (outcome.status !== "verifying") continue;
    const transfer = polled.transfers.find(
      (t) => String(t.txHash ?? "").trim() === String(outcome.txHash ?? "").trim(),
    );
    const lag = detectionLatencyFromBlockMs({
      blockTimestampMs: transfer?.blockTimestampMs,
      nowMs,
    });
    if (lag != null) outcome.detectionLatencyMs = lag;
  }

  const fromBackfill = await patchMissingFromAddresses(pool, {
    network: filter.network,
    transfers: polled.transfers,
  });
  const receivedBackfill = await patchMissingReceivedAmounts(pool, {
    network: filter.network,
    transfers: polled.transfers,
  });

  /** @type {unknown[]} */
  let confirmOutcomes = [];
  let toConfirmCount = 0;
  if (!matchOnly) {
    const awaiting = await listOrdersAwaitingConfirmations(pool, filter);
    const freshTx = new Set(
      matchOutcomes
        .filter((o) => o.status === "verifying" && o.txHash)
        .map((o) => String(o.txHash).trim()),
    );
    const toConfirm = awaiting.filter((o) =>
      freshTx.has(String(o.txHash ?? "").trim()),
    );
    toConfirmCount = toConfirm.length;
    confirmOutcomes = await processConfirmationBatch({
      orders: toConfirm,
      concurrency: confirmConcurrency,
      getConfirmationState: (args) =>
        chain.getTransactionConfirmationState({
          ...args,
          asset: filter.asset,
        }),
      apply: (args) => applyConfirmationUpdate(pool, args),
    });
  }

  /** @type {string | null} */
  let rpcGapWarning = null;
  if (polled.mode === "stub" && matchCandidates.length > 0) {
    rpcGapWarning = "rpc_not_configured_open_orders_will_not_complete";
  }

  const detectionLatencies = matchOutcomes
    .map((o) => o.detectionLatencyMs)
    .filter((n) => typeof n === "number" && Number.isFinite(n));

  return {
    asset: filter.asset,
    network: filter.network,
    mode: matchOnly ? "match" : "match+confirm",
    phase: "m3-43",
    chainPollMode: polled.mode,
    ingestError: polled.error ?? null,
    rpcGapWarning,
    watchedAddresses: watchedAddresses.length,
    addressBudget: {
      budget: selected.budget,
      totalAddressCount: selected.totalAddressCount,
      pendingAddressCount: selected.pendingAddressCount,
      deferredAddressCount: selected.deferredAddressCount,
      polledAddressCount: watchedAddresses.length,
    },
    pendingPaymentOrders,
    openOrders: matchCandidates.length,
    transfersSeen: polled.transfers.length,
    transferHintsMerged: Number(polled.transferHintsMerged) || 0,
    transfersDuplicate: matchOutcomes.filter(
      (o) => o.reason === "duplicate_tx_hash",
    ).length,
    matchOutcomes,
    detectionLatencyMs:
      detectionLatencies.length > 0
        ? {
            count: detectionLatencies.length,
            min: Math.min(...detectionLatencies),
            max: Math.max(...detectionLatencies),
            avg: Math.round(
              detectionLatencies.reduce((a, b) => a + b, 0) /
                detectionLatencies.length,
            ),
          }
        : null,
    fromAddressBackfilled: fromBackfill.updated,
    receivedAmountBackfilled: receivedBackfill.updated,
    awaitingConfirmations: toConfirmCount,
    confirmOutcomes,
    restartSafe: true,
    reorgAware: true,
    anomalyPaths: true,
  };
}

/**
 * Fast confirmation pass for all verifying orders (before heavy per-scope ingest).
 * @param {import("pg").Pool} pool
 * @param {{ confirmConcurrency?: number, scopeConcurrency?: number }} [opts]
 */
async function processPriorityConfirmations(pool, opts = {}) {
  const confirmConcurrency = opts.confirmConcurrency ?? 8;
  const scopeConcurrency = opts.scopeConcurrency ?? 4;
  const orders = await listAllOrdersAwaitingConfirmations(pool);
  if (orders.length === 0) {
    return { priorityConfirmations: 0, priorityConfirmOutcomes: [] };
  }

  /** @type {Map<string, typeof orders>} */
  const byScope = new Map();
  for (const order of orders) {
    const key = `${order.asset}:${order.network}`;
    const group = byScope.get(key);
    if (group) group.push(order);
    else byScope.set(key, [order]);
  }

  const groups = [...byScope.entries()];
  const nested = await mapPool(groups, scopeConcurrency, async ([key, group]) => {
    const [asset, network] = key.split(":");
    const chain = await loadChainClient(network);
    return processConfirmationBatch({
      orders: group,
      concurrency: confirmConcurrency,
      getConfirmationState: (args) =>
        chain.getTransactionConfirmationState({
          ...args,
          asset,
          network,
        }),
      apply: (args) => applyConfirmationUpdate(pool, args),
    });
  });

  return {
    priorityConfirmations: orders.length,
    priorityConfirmOutcomes: nested.flat(),
  };
}

/**
 * @param {Promise<Record<string, unknown>>} promise
 * @param {number} timeoutMs
 * @param {{ asset: string, network: string }} filter
 */
function withScopeTimeout(promise, timeoutMs, filter) {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve({
        asset: filter.asset,
        network: filter.network,
        mode: "error",
        phase: "m3-40",
        error: `scope timeout after ${timeoutMs}ms`,
      });
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * @param {Array<Record<string, unknown>>} scopeResults
 */
function aggregateIngest(scopeResults) {
  if (scopeResults.length === 0) {
    return {
      mode: "idle",
      scopes: [],
      note: "No watch scopes resolved",
    };
  }
  if (scopeResults.length === 1) {
    return scopeResults[0];
  }

  const errors = scopeResults.filter((s) => s.mode === "error");
  const sum = (key) =>
    scopeResults.reduce((n, s) => n + (Number(s[key]) || 0), 0);

  const modes = new Set(scopeResults.map((s) => s.mode));
  const aggregateMode =
    errors.length === scopeResults.length
      ? "error"
      : modes.has("match+confirm")
        ? "match+confirm"
        : modes.has("match")
          ? "match"
          : "match+confirm";

  return {
    mode: aggregateMode,
    phase: "m3-43-multi",
    multiNetwork: true,
    scopeCount: scopeResults.length,
    scopes: scopeResults.map((s) => ({
      asset: s.asset,
      network: s.network,
      mode: s.mode,
      chainPollMode: s.chainPollMode,
      openOrders: s.openOrders,
      pendingPaymentOrders: s.pendingPaymentOrders,
      transfersSeen: s.transfersSeen,
      awaitingConfirmations: s.awaitingConfirmations,
      addressBudget: s.addressBudget,
      detectionLatencyMs: s.detectionLatencyMs,
      ingestError: s.ingestError ?? s.error ?? null,
    })),
    watchedAddresses: sum("watchedAddresses"),
    openOrders: sum("openOrders"),
    pendingPaymentOrders: sum("pendingPaymentOrders"),
    transfersSeen: sum("transfersSeen"),
    awaitingConfirmations: sum("awaitingConfirmations"),
    deferredAddresses: scopeResults.reduce(
      (n, s) => n + (Number(s.addressBudget?.deferredAddressCount) || 0),
      0,
    ),
    ingestError:
      errors.map((e) => e.error).filter(Boolean).join("; ") || null,
    restartSafe: true,
    reorgAware: true,
    anomalyPaths: true,
  };
}

/**
 * @param {{
 *   tick: number,
 *   startedAt: string,
 *   config: ReturnType<import('./config.mjs').loadWatcherConfig>,
 *   matchOnly?: boolean,
 * }} ctx
 */
export async function runTick(ctx) {
  const matchOnly = Boolean(ctx.matchOnly);
  const [
    tron,
    tronNile,
    ethereum,
    solana,
  ] = await Promise.all([
    tronHealthCheck({ network: "tron" }),
    tronHealthCheck({ network: "tron_nile" }),
    ethHealthCheck(),
    solanaHealthCheck(),
  ]);

  /** @type {Record<string, unknown>} */
  let ingest = {
    mode: "noop",
    note: "Set DATABASE_URL to enable payment_orders match + confirmations",
    pendingPaymentOrders: 0,
    awaitingConfirmations: 0,
  };
  /** @type {Record<string, Record<string, unknown>>} */
  let ingestByNetwork = {};
  /** @type {Array<{ asset: string, network: string }>} */
  let targets = [
    {
      asset: ctx.config.defaultAsset,
      network: ctx.config.defaultNetwork,
    },
  ];

  if (ctx.config.databaseUrl) {
    try {
      const pool = getWatcherPool();
      const confirmConcurrency = ctx.config.confirmConcurrency;
      const scopeConcurrency = ctx.config.scopeConcurrency;
      const addressPollBudget = ctx.config.addressPollBudget;
      const priorityConfirm = matchOnly
        ? { priorityConfirmations: 0, priorityConfirmOutcomes: [] }
        : await processPriorityConfirmations(pool, {
            confirmConcurrency,
            scopeConcurrency,
          });
      const openScopes = ctx.config.multiNetwork
        ? await listDistinctWatchScopes(pool)
        : [];
      targets = resolveWatchScopes(ctx.config, openScopes);

      const scopeResults = await mapPool(
        targets,
        scopeConcurrency,
        async (filter) => {
          try {
            return await withScopeTimeout(
              ingestScope(pool, filter, {
                confirmConcurrency,
                addressPollBudget,
                matchOnly,
              }),
              ctx.config.scopeTimeoutMs,
              filter,
            );
          } catch (err) {
            return {
              asset: filter.asset,
              network: filter.network,
              mode: "error",
              phase: "m3-40",
              error: err instanceof Error ? err.message : String(err),
              pendingPaymentOrders: 0,
            };
          }
        },
      );

      for (const result of scopeResults) {
        const network = String(result.network ?? "");
        const prev = ingestByNetwork[network];
        if (!prev) {
          ingestByNetwork[network] = result;
        } else if (result.mode === "error" && prev.mode !== "error") {
          continue;
        } else {
          ingestByNetwork[network] = {
            ...result,
            openOrders:
              (Number(prev.openOrders) || 0) + (Number(result.openOrders) || 0),
            pendingPaymentOrders:
              (Number(prev.pendingPaymentOrders) || 0) +
              (Number(result.pendingPaymentOrders) || 0),
            transfersSeen:
              (Number(prev.transfersSeen) || 0) +
              (Number(result.transfersSeen) || 0),
            awaitingConfirmations:
              (Number(prev.awaitingConfirmations) || 0) +
              (Number(result.awaitingConfirmations) || 0),
            watchedAddresses:
              (Number(prev.watchedAddresses) || 0) +
              (Number(result.watchedAddresses) || 0),
            assets: [
              ...new Set([
                ...(Array.isArray(prev.assets) ? prev.assets : [prev.asset]),
                result.asset,
              ]),
            ],
          };
        }
      }

      ingest = aggregateIngest(scopeResults);
      ingest.priorityConfirmations = priorityConfirm.priorityConfirmations;
      ingest.priorityConfirmOutcomes = priorityConfirm.priorityConfirmOutcomes;
      const workload = await countWatcherWorkload(pool);
      ingest.pendingPaymentOrders = workload.pendingPaymentOrders;
      ingest.awaitingConfirmations = workload.awaitingConfirmations;
    } catch (err) {
      ingest = {
        mode: "error",
        phase: "m3-40",
        error: err instanceof Error ? err.message : String(err),
        pendingPaymentOrders: 0,
        awaitingConfirmations: 0,
      };
    }
  }

  const payload = {
    service: "paymentgate-watcher",
    phase: ctx.config.databaseUrl ? "m3-anomaly-paths" : "m1-loop",
    tick: ctx.tick,
    tickKind: matchOnly ? "pending_fast" : "full",
    startedAt: ctx.startedAt,
    at: new Date().toISOString(),
    pollIntervalMs: ctx.config.pollIntervalMs,
    pendingPollIntervalMs: ctx.config.pendingPollIntervalMs,
    idlePollIntervalMs: ctx.config.idlePollIntervalMs,
    addressPollBudget: ctx.config.addressPollBudget,
    multiNetwork: ctx.config.multiNetwork,
    target: {
      asset: ctx.config.defaultAsset,
      network: ctx.config.defaultNetwork,
    },
    targets,
    chain: {
      tron,
      tron_nile: tronNile,
      ethereum,
      solana,
    },
    ingest,
    ingestByNetwork,
    workload: {
      pendingPaymentOrders: Number(ingest.pendingPaymentOrders) || 0,
      awaitingConfirmations: Number(ingest.awaitingConfirmations) || 0,
    },
  };

  if (ctx.config.databaseUrl) {
    try {
      await persistTickHeartbeats(getWatcherPool(), payload);
      payload.heartbeat = { persisted: true };
    } catch (err) {
      payload.heartbeat = {
        persisted: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return payload;
}
