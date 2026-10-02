import { extraWatcherBackoffMs as tronExtraBackoff } from "@paymentgate/chain-clients/tron";
import { extraWatcherBackoffMs as ethExtraBackoff } from "@paymentgate/chain-clients/ethereum";
import { extraWatcherBackoffMs as solanaExtraBackoff } from "@paymentgate/chain-clients/solana";
import { loadWatcherConfig, resolveNextPollIntervalMs } from "./config.mjs";
import { runTick } from "./tick.mjs";

/**
 * Run the watcher loop until `signal` aborts or `--once` completes one tick.
 *
 * Adaptive cadence (all networks):
 * - pending_payment open → WATCHER_PENDING_POLL_INTERVAL_MS (+ optional match-only fast ticks)
 * - only confirming → WATCHER_POLL_INTERVAL_MS
 * - idle → WATCHER_IDLE_POLL_INTERVAL_MS
 *
 * @param {{ once?: boolean; signal?: AbortSignal }} options
 */
export async function runWatcherLoop(options = {}) {
  const config = loadWatcherConfig();
  const startedAt = new Date().toISOString();
  let tick = 0;
  let stopping = false;
  /** Remaining match-only ticks after a full tick while pending work exists. */
  let pendingFastRemaining = 0;

  const stop = () => {
    stopping = true;
  };

  if (options.signal) {
    if (options.signal.aborted) stop();
    else options.signal.addEventListener("abort", stop, { once: true });
  }

  console.log(
    JSON.stringify({
      service: "paymentgate-watcher",
      event: "start",
      phase: "m1-loop",
      startedAt,
      pollIntervalMs: config.pollIntervalMs,
      pendingPollIntervalMs: config.pendingPollIntervalMs,
      idlePollIntervalMs: config.idlePollIntervalMs,
      addressPollBudget: config.addressPollBudget,
      pendingFastTicks: config.pendingFastTicks,
      once: Boolean(options.once),
    }),
  );

  while (!stopping) {
    tick += 1;
    const matchOnly = pendingFastRemaining > 0;
    if (matchOnly) pendingFastRemaining -= 1;

    const payload = await runTick({
      tick,
      startedAt,
      config,
      matchOnly,
    });
    console.log(JSON.stringify(payload));

    if (options.once) break;

    const workload = payload.workload ?? {
      pendingPaymentOrders: Number(payload.ingest?.pendingPaymentOrders) || 0,
      awaitingConfirmations: Number(payload.ingest?.awaitingConfirmations) || 0,
    };

    if (
      !matchOnly &&
      workload.pendingPaymentOrders > 0 &&
      config.pendingFastTicks > 0
    ) {
      pendingFastRemaining = config.pendingFastTicks;
    }
    if (workload.pendingPaymentOrders === 0) {
      pendingFastRemaining = 0;
    }

    const sleepMs = resolveNextPollIntervalMs(config, workload);
    payload.nextPollIntervalMs = sleepMs;

    const extraMs = Math.max(
      tronExtraBackoff(payload, config.pollIntervalMs),
      ethExtraBackoff(payload, config.pollIntervalMs),
      solanaExtraBackoff(payload, config.pollIntervalMs),
    );
    if (extraMs > 0) {
      console.log(
        JSON.stringify({
          service: "paymentgate-watcher",
          event: "rpc-backoff",
          extraMs,
          ingestMode: payload.ingest?.mode,
          chainPollMode: payload.ingest?.chainPollMode,
          at: new Date().toISOString(),
        }),
      );
    }
    console.log(
      JSON.stringify({
        service: "paymentgate-watcher",
        event: "schedule",
        sleepMs,
        extraMs,
        tickKind: payload.tickKind,
        workload,
        pendingFastRemaining,
        at: new Date().toISOString(),
      }),
    );
    await sleep(sleepMs + extraMs, options.signal);
    if (options.signal?.aborted) stopping = true;
  }

  console.log(
    JSON.stringify({
      service: "paymentgate-watcher",
      event: "shutdown",
      phase: "m1-loop",
      ticks: tick,
      stoppedAt: new Date().toISOString(),
    }),
  );
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
