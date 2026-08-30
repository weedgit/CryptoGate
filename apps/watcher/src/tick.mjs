/**
 * One watcher iteration.
 * M3-40: poll transfers for watched open-order addresses.
 * M3-41: match inbound transfers → payment_orders.
 * M3-42: advance verifying/confirmed → completed when confirmations met.
 * Multi-network: poll every open asset+network scope (WATCHER_MULTI_NETWORK=true default).
 */
import { healthCheck as ethHealthCheck } from "@cryptogate/chain-clients/ethereum";
import { healthCheck as bscHealthCheck } from "@cryptogate/chain-clients/bnb_smart_chain";
import { healthCheck as polygonHealthCheck } from "@cryptogate/chain-clients/polygon";
import { healthCheck as arbitrumHealthCheck } from "@cryptogate/chain-clients/arbitrum_one";
import { healthCheck as baseHealthCheck } from "@cryptogate/chain-clients/base";
import { healthCheck as solanaHealthCheck } from "@cryptogate/chain-clients/solana";
import { healthCheck as tonHealthCheck } from "@cryptogate/chain-clients/ton";
import { healthCheck as bitcoinHealthCheck } from "@cryptogate/chain-clients/bitcoin";
import { healthCheck as tronHealthCheck } from "@cryptogate/chain-clients/tron";
import { resolveWatchScopes } from "./config.mjs";
import { loadChainClient } from "./chain-client.mjs";
import { processConfirmationBatch } from "./confirm/advance.mjs";
import { getWatcherPool } from "./db/pool.mjs";
import { persistTickHeartbeats } from "./health/heartbeat-store.mjs";
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
  listOrdersByReceiveAddresses,
  patchMissingFromAddresses,
  patchMissingReceivedAmounts,
} from "./orders/order-store.mjs";

/**
 * @param {import("pg").Pool} pool
 * @param {{ asset: string, network: string }} filter
 */
async function ingestScope(pool, filter) {
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
  const watchedAddresses = [
    ...new Set(
      [
        ...openOrders.map((o) => o.receiveAddress.trim()),
        ...fromBackfillAddresses,
        ...receivedBackfillAddresses,
      ].filter(Boolean),
    ),
  ];
  const crossNet = await listOrdersByReceiveAddresses(pool, {
    addresses: watchedAddresses,
  });
  const byId = new Map();
  for (const o of [...openOrders, ...crossNet]) {
    byId.set(o.orderId, o);
  }
  const matchCandidates = [...byId.values()];

  const polled = await chain.listRecentTransfers({
    ...filter,
    watchedAddresses,
  });

  const known = await listKnownTxHashes(pool, {
    network: filter.network,
    txHashes: polled.transfers.map((t) => t.txHash).filter(Boolean),
  });

  const matchOutcomes = await processTransferBatch({
    transfers: polled.transfers.map((t) => ({
      toAddress: t.toAddress,
      fromAddress: t.fromAddress,
      amount: t.amount,
      asset: t.asset ?? filter.asset,
      network: t.network ?? filter.network,
      txHash: t.txHash,
      memoOrTag: t.memoOrTag,
    })),
    openOrders: matchCandidates,
    knownTxHashes: known,
    apply: (args) => applyMatchResult(pool, args),
  });

  const fromBackfill = await patchMissingFromAddresses(pool, {
    network: filter.network,
    transfers: polled.transfers,
  });
  const receivedBackfill = await patchMissingReceivedAmounts(pool, {
    network: filter.network,
    transfers: polled.transfers,
  });

  const awaiting = await listOrdersAwaitingConfirmations(pool, filter);
  const confirmOutcomes = await processConfirmationBatch({
    orders: awaiting,
    getConfirmationState: (args) =>
      chain.getTransactionConfirmationState({
        ...args,
        asset: filter.asset,
      }),
    apply: (args) => applyConfirmationUpdate(pool, args),
  });

  return {
    asset: filter.asset,
    network: filter.network,
    mode: "match+confirm",
    phase: "m3-43",
    chainPollMode: polled.mode,
    ingestError: polled.error ?? null,
    watchedAddresses: watchedAddresses.length,
    openOrders: matchCandidates.length,
    transfersSeen: polled.transfers.length,
    transfersDuplicate: matchOutcomes.filter(
      (o) => o.reason === "duplicate_tx_hash",
    ).length,
    matchOutcomes,
    fromAddressBackfilled: fromBackfill.updated,
    receivedAmountBackfilled: receivedBackfill.updated,
    awaitingConfirmations: awaiting.length,
    confirmOutcomes,
    restartSafe: true,
    reorgAware: true,
    anomalyPaths: true,
  };
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

  return {
    mode: errors.length === scopeResults.length ? "error" : "match+confirm",
    phase: "m3-43-multi",
    multiNetwork: true,
    scopeCount: scopeResults.length,
    scopes: scopeResults.map((s) => ({
      asset: s.asset,
      network: s.network,
      mode: s.mode,
      chainPollMode: s.chainPollMode,
      openOrders: s.openOrders,
      transfersSeen: s.transfersSeen,
      awaitingConfirmations: s.awaitingConfirmations,
      ingestError: s.ingestError ?? s.error ?? null,
    })),
    watchedAddresses: sum("watchedAddresses"),
    openOrders: sum("openOrders"),
    transfersSeen: sum("transfersSeen"),
    awaitingConfirmations: sum("awaitingConfirmations"),
    ingestError:
      errors.map((e) => e.error).filter(Boolean).join("; ") || null,
    restartSafe: true,
    reorgAware: true,
    anomalyPaths: true,
  };
}

/**
 * @param {{ tick: number; startedAt: string; config: ReturnType<import('./config.mjs').loadWatcherConfig> }} ctx
 */
export async function runTick(ctx) {
  const tron = await tronHealthCheck();
  const ethereum = await ethHealthCheck();
  const bnbSmartChain = await bscHealthCheck();
  const polygon = await polygonHealthCheck();
  const arbitrumOne = await arbitrumHealthCheck();
  const base = await baseHealthCheck();
  const solana = await solanaHealthCheck();
  const ton = await tonHealthCheck();
  const bitcoin = await bitcoinHealthCheck();

  /** @type {Record<string, unknown>} */
  let ingest = {
    mode: "noop",
    note: "Set DATABASE_URL to enable payment_orders match + confirmations",
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
      const openScopes = ctx.config.multiNetwork
        ? await listDistinctWatchScopes(pool)
        : [];
      targets = resolveWatchScopes(ctx.config, openScopes);

      /** @type {Array<Record<string, unknown>>} */
      const scopeResults = [];
      for (const filter of targets) {
        try {
          const result = await ingestScope(pool, filter);
          scopeResults.push(result);
          const prev = ingestByNetwork[filter.network];
          if (!prev) {
            ingestByNetwork[filter.network] = result;
          } else {
            ingestByNetwork[filter.network] = {
              ...result,
              openOrders:
                (Number(prev.openOrders) || 0) +
                (Number(result.openOrders) || 0),
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
        } catch (err) {
          const failed = {
            asset: filter.asset,
            network: filter.network,
            mode: "error",
            phase: "m3-40",
            error: err instanceof Error ? err.message : String(err),
          };
          scopeResults.push(failed);
          ingestByNetwork[filter.network] = failed;
        }
      }

      ingest = aggregateIngest(scopeResults);
    } catch (err) {
      ingest = {
        mode: "error",
        phase: "m3-40",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const payload = {
    service: "cryptogate-watcher",
    phase: ctx.config.databaseUrl ? "m3-anomaly-paths" : "m1-loop",
    tick: ctx.tick,
    startedAt: ctx.startedAt,
    at: new Date().toISOString(),
    pollIntervalMs: ctx.config.pollIntervalMs,
    multiNetwork: ctx.config.multiNetwork,
    target: {
      asset: ctx.config.defaultAsset,
      network: ctx.config.defaultNetwork,
    },
    targets,
    chain: {
      tron,
      ethereum,
      bnb_smart_chain: bnbSmartChain,
      polygon,
      arbitrum_one: arbitrumOne,
      base,
      solana,
      ton,
      bitcoin,
    },
    ingest,
    ingestByNetwork,
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
