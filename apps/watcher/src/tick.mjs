/**
 * One watcher iteration.
 * M3-40: poll transfers for watched open-order addresses (RPC stub until live).
 * M3-41: match inbound transfers → payment_orders.
 * M3-42: advance verifying/confirmed → completed when confirmations met.
 * M3-32: ethereum client when DEFAULT_NETWORK=ethereum.
 */
import { healthCheck as ethHealthCheck } from "@cryptogate/chain-clients/ethereum";
import { healthCheck as tronHealthCheck } from "@cryptogate/chain-clients/tron";
import { loadChainClient } from "./chain-client.mjs";
import { processConfirmationBatch } from "./confirm/advance.mjs";
import { getWatcherPool } from "./db/pool.mjs";
import { persistTickHeartbeats } from "./health/heartbeat-store.mjs";
import { processTransferBatch } from "./match/inbound.mjs";
import {
  applyConfirmationUpdate,
  applyMatchResult,
  listKnownTxHashes,
  listOpenOrdersForMatch,
  listOrdersAwaitingConfirmations,
  listOrdersByReceiveAddresses,
} from "./orders/order-store.mjs";

/**
 * @param {{ tick: number; startedAt: string; config: ReturnType<import('./config.mjs').loadWatcherConfig> }} ctx
 */
export async function runTick(ctx) {
  const tron = await tronHealthCheck();
  const ethereum = await ethHealthCheck();
  /** @type {Record<string, unknown>} */
  let ingest = {
    mode: "noop",
    note: "Set DATABASE_URL to enable payment_orders match + confirmations",
  };

  if (ctx.config.databaseUrl) {
    try {
      const pool = getWatcherPool();
      const filter = {
        asset: ctx.config.defaultAsset,
        network: ctx.config.defaultNetwork,
      };

      const chain = await loadChainClient(filter.network);

      const openOrders = await listOpenOrdersForMatch(pool, filter);
      const watchedAddresses = [
        ...new Set(
          openOrders.map((o) => o.receiveAddress.trim()).filter(Boolean),
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
          amount: t.amount,
          asset: t.asset ?? ctx.config.defaultAsset,
          network: t.network ?? ctx.config.defaultNetwork,
          txHash: t.txHash,
          memoOrTag: t.memoOrTag,
        })),
        openOrders: matchCandidates,
        knownTxHashes: known,
        apply: (args) => applyMatchResult(pool, args),
      });

      const awaiting = await listOrdersAwaitingConfirmations(pool, filter);
      const confirmOutcomes = await processConfirmationBatch({
        orders: awaiting,
        getConfirmationState: chain.getTransactionConfirmationState,
        apply: (args) => applyConfirmationUpdate(pool, args),
      });

      ingest = {
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
        awaitingConfirmations: awaiting.length,
        confirmOutcomes,
        restartSafe: true,
        reorgAware: true,
        anomalyPaths: true,
      };
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
    target: {
      asset: ctx.config.defaultAsset,
      network: ctx.config.defaultNetwork,
    },
    chain: {
      tron,
      ethereum,
    },
    ingest,
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
