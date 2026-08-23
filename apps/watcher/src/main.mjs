/**
 * CryptoGate watcher — separate process from apps/api (Bruce).
 * M1: poll loop + graceful shutdown; M3: chain ingest + matching.
 */
import { runWatcherLoop } from "./loop.mjs";

/** Default one tick (CI / `node main.mjs`). Production: `pnpm start` passes `--loop`. */
const once = !process.argv.includes("--loop");

const controller = new AbortController();

function shutdown(signal) {
  console.log(
    JSON.stringify({
      service: "cryptogate-watcher",
      event: "signal",
      signal,
      at: new Date().toISOString(),
    }),
  );
  controller.abort();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

try {
  await runWatcherLoop({ once, signal: controller.signal });
  process.exitCode = 0;
} catch (err) {
  console.error(
    JSON.stringify({
      service: "cryptogate-watcher",
      event: "fatal",
      message: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exitCode = 1;
}
