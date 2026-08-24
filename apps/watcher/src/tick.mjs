/**
 * One watcher iteration.
 * M3-41: match inbound transfers → payment_orders.
 * M3-42: advance verifying/confirmed → completed when confirmations met.
 */
import {
  getTransactionConfirmations,
  healthCheck as tronHealthCheck,
  listRecentTransfers,
} from "@cryptogate/chain-clients/tron";
import { processConfirmationBatch } from "./confirm/advance.mjs";
import { getWatcherPool } from "./db/pool.mjs";
import { processTransferBatch } from "./match/inbound.mjs";
import {
  applyConfirmationUpdate,
  applyMatchResult,
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
      const { transfers } = await listRecentTransfers(filter);

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
        getConfirmations: getTransactionConfirmations,
        apply: (args) => applyConfirmationUpdate(pool, args),
      });

      ingest = {
        mode: "match+confirm",
        phase: "m3-42",
        openOrders: openOrders.length,
        transfersSeen: transfers.length,
        matchOutcomes,
        awaitingConfirmations: awaiting.length,
        confirmOutcomes,
      };
    } catch (err) {
      ingest = {
        mode: "error",
        phase: "m3-42",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    service: "cryptogate-watcher",
    phase: ctx.config.databaseUrl ? "m3-confirm-wire" : "m1-loop",
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
