/**
 * One watcher iteration.
 * M1: health + chain stub.
 * M3-41: when DATABASE_URL set, load open orders + listRecentTransfers → matchTransaction.
 */
import {
  healthCheck as tronHealthCheck,
  listRecentTransfers,
} from "@cryptogate/chain-clients/tron";
import { getWatcherPool } from "./db/pool.mjs";
import { processTransferBatch } from "./match/inbound.mjs";
import {
  applyMatchResult,
  listOpenOrdersForMatch,
} from "./orders/order-store.mjs";

/**
 * @param {{ tick: number; startedAt: string; config: ReturnType<import('./config.mjs').loadWatcherConfig> }} ctx
 */
export async function runTick(ctx) {
  const tron = await tronHealthCheck();
  /** @type {Record<string, unknown>} */
  let ingest = {
    mode: "noop",
    note: "Set DATABASE_URL to enable payment_orders match wire (M3-41)",
  };

  if (ctx.config.databaseUrl) {
    try {
      const pool = getWatcherPool();
      const openOrders = await listOpenOrdersForMatch(pool, {
        asset: ctx.config.defaultAsset,
        network: ctx.config.defaultNetwork,
      });
      const { transfers } = await listRecentTransfers({
        asset: ctx.config.defaultAsset,
        network: ctx.config.defaultNetwork,
      });

      const outcomes = await processTransferBatch({
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

      ingest = {
        mode: "match",
        phase: "m3-41",
        openOrders: openOrders.length,
        transfersSeen: transfers.length,
        outcomes,
      };
    } catch (err) {
      ingest = {
        mode: "error",
        phase: "m3-41",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    service: "cryptogate-watcher",
    phase: ctx.config.databaseUrl ? "m3-match-wire" : "m1-loop",
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
