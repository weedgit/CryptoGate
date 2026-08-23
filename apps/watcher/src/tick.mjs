/**
 * One watcher iteration. M1: health + chain stub only; M3 adds DB ingest + matching.
 */
import { healthCheck as tronHealthCheck } from "@cryptogate/chain-clients/tron";

/**
 * @param {{ tick: number; startedAt: string; config: ReturnType<import('./config.mjs').loadWatcherConfig> }} ctx
 */
export async function runTick(ctx) {
  const tron = await tronHealthCheck();

  return {
    service: "cryptogate-watcher",
    phase: "m1-loop",
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
    ingest: {
      mode: "noop",
      note: "payment_orders ingest starts M3 after Andrew migration",
    },
  };
}
