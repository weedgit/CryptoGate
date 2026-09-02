import { extraWatcherBackoffMs as tronExtraBackoff } from "@paymentgate/chain-clients/tron";
import { extraWatcherBackoffMs as ethExtraBackoff } from "@paymentgate/chain-clients/ethereum";
import { extraWatcherBackoffMs as bscExtraBackoff } from "@paymentgate/chain-clients/bnb_smart_chain";
import { extraWatcherBackoffMs as polygonExtraBackoff } from "@paymentgate/chain-clients/polygon";
import { extraWatcherBackoffMs as arbitrumExtraBackoff } from "@paymentgate/chain-clients/arbitrum_one";
import { extraWatcherBackoffMs as baseExtraBackoff } from "@paymentgate/chain-clients/base";
import { extraWatcherBackoffMs as solanaExtraBackoff } from "@paymentgate/chain-clients/solana";
import { extraWatcherBackoffMs as tonExtraBackoff } from "@paymentgate/chain-clients/ton";
import { extraWatcherBackoffMs as bitcoinExtraBackoff } from "@paymentgate/chain-clients/bitcoin";
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
      service: "paymentgate-watcher",
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

    const extraMs = Math.max(
      tronExtraBackoff(payload, config.pollIntervalMs),
      ethExtraBackoff(payload, config.pollIntervalMs),
      bscExtraBackoff(payload, config.pollIntervalMs),
      polygonExtraBackoff(payload, config.pollIntervalMs),
      arbitrumExtraBackoff(payload, config.pollIntervalMs),
      baseExtraBackoff(payload, config.pollIntervalMs),
      solanaExtraBackoff(payload, config.pollIntervalMs),
      tonExtraBackoff(payload, config.pollIntervalMs),
      bitcoinExtraBackoff(payload, config.pollIntervalMs),
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
    await sleep(config.pollIntervalMs + extraMs, options.signal);
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
