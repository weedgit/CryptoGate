/**
 * One watcher iteration.
 * M3-40: poll transfers for watched open-order addresses (RPC stub until live).
 * M3-41: match inbound transfers → payment_orders.
 * M3-42: advance verifying/confirmed → completed when confirmations met.
 */
import {
  getTransactionConfirmationState,
  healthCheck as tronHealthCheck,
  listRecentTransfers,
} from "@cryptogate/chain-clients/tron";
import { processConfirmationBatch } from "./confirm/advance.mjs";
import { getWatcherPool } from "./db/pool.mjs";
import { processTransferBatch } from "./match/inbound.mjs";
import {
  applyConfirmationUpdate,
  applyMatchResult,
  listKnownTxHashes,
  listOpenOrdersForMatch,
  listOrdersAwaitingConfirmations,
} from "./orders/order-store.mjs";

/**
 * @param {{ tick: number; startedAt: string; config: ReturnType<import('./config.mjs').loadWatcherConfig> }} ctx
 */
export async function runTick(ctx) {
  const tron = await tronHealthCheck();
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

      const openOrders = await listOpenOrdersForMatch(pool, filter);
      const watchedAddresses = [
        ...new Set(
          openOrders.map((o) => o.receiveAddress.trim()).filter(Boolean),
        ),
      ];

      const polled = await listRecentTransfers({
        ...filter,
        watchedAddresses,
      });

      const known = await listKnownTxHashes(pool, {
        network: filter.network,
        txHashes: polled.transfers.map((t) => t.txHash).filter(Boolean),
      });
      const transfers = polled.transfers.filter((t) => !known.has(t.txHash));

      const matchOutcomes = await processTransferBatch({
        transfers: transfers.map((t) => ({
          toAddress: t.toAddress,
          amount: t.amount,
          asset: t.asset ?? ctx.config.defaultAsset,
          network: t.network ?? ctx.config.defaultNetwork,
          txHash: t.txHash,
          memoOrTag: t.memoOrTag,
        })),
        openOrders,
        apply: (args) => applyMatchResult(pool, args),
      });

      const awaiting = await listOrdersAwaitingConfirmations(pool, filter);
      const confirmOutcomes = await processConfirmationBatch({
        orders: awaiting,
        getConfirmationState: getTransactionConfirmationState,
        apply: (args) => applyConfirmationUpdate(pool, args),
      });

      ingest = {
        mode: "match+confirm",
        phase: "m4-21",
        chainPollMode: polled.mode,
        ingestError: polled.error ?? null,
        watchedAddresses: watchedAddresses.length,
        openOrders: openOrders.length,
        transfersSeen: polled.transfers.length,
        transfersNew: transfers.length,
        matchOutcomes,
        awaitingConfirmations: awaiting.length,
        confirmOutcomes,
        restartSafe: true,
        reorgAware: true,
      };
    } catch (err) {
      ingest = {
        mode: "error",
        phase: "m3-40",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    service: "cryptogate-watcher",
    phase: ctx.config.databaseUrl ? "m4-reorg-safe" : "m1-loop",
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
    },
    ingest,
  };
}
