import { extraWatcherBackoffMs } from "@cryptogate/chain-clients/tron";
import { loadWatcherConfig } from "./config.mjs";
import { runTick } from "./tick.mjs";

/**
 * Run the watcher loop until `signal` aborts or `--once` completes one tick.
 *
 * @param {{ once?: boolean; signal?: AbortSignal }} options
 */
export async function runWatcherLoop(options = {}) {
  const config = loadWatcherConfig();
  const startedAt = new Date().toISOString();
  let tick = 0;
  let stopping = false;

  const stop = () => {
    stopping = true;
  };

  if (options.signal) {
    if (options.signal.aborted) stop();
    else options.signal.addEventListener("abort", stop, { once: true });
  }

  console.log(
    JSON.stringify({
      service: "cryptogate-watcher",
      event: "start",
      phase: "m1-loop",
      startedAt,
      pollIntervalMs: config.pollIntervalMs,
      once: Boolean(options.once),
    }),
  );

  while (!stopping) {
    tick += 1;
    const payload = await runTick({ tick, startedAt, config });
    console.log(JSON.stringify(payload));

    if (options.once) break;

    const extraMs = extraWatcherBackoffMs(payload, config.pollIntervalMs);
    if (extraMs > 0) {
      console.log(
        JSON.stringify({
          service: "cryptogate-watcher",
          event: "rpc-backoff",
          extraMs,
          ingestMode: payload.ingest?.mode,
          chainPollMode: payload.ingest?.chainPollMode,
          at: new Date().toISOString(),
        }),
      );
    }
    await sleep(config.pollIntervalMs + extraMs, options.signal);
    if (options.signal?.aborted) stopping = true;
  }

  console.log(
    JSON.stringify({
      service: "cryptogate-watcher",
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
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    }
  });
}
