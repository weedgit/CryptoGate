import { processDueWebhookDeliveries } from "./webhook-deliver.mjs";
import { processPaymentOrderWebhookOutbox } from "./webhook-fanout.mjs";

/**
 * @typedef {{
 *   configured: boolean,
 *   enabled: boolean,
 *   started: boolean,
 *   intervalMs: number,
 *   lastTickAt: number | null,
 *   lastError: string | null,
 * }} WebhookDeliveryWorkerSnapshot
 */

/** @type {WebhookDeliveryWorkerSnapshot} */
const workerState = {
  configured: false,
  enabled: false,
  started: false,
  intervalMs: 5_000,
  lastTickAt: null,
  lastError: null,
};

/** Live snapshot for GET /health (same process as the delivery job). */
export function getWebhookDeliveryWorkerSnapshot() {
  return {
    configured: workerState.configured,
    enabled: workerState.enabled,
    started: workerState.started,
    intervalMs: workerState.intervalMs,
    lastTickAt: workerState.lastTickAt,
    lastError: workerState.lastError,
  };
}

/**
 * Background delivery worker (M3-14): fan-out outbox then POST deliveries.
 * @param {{
 *   intervalMs?: number,
 *   enabled?: boolean,
 *   run?: () => Promise<unknown>,
 * }} [options]
 */
export function startWebhookDeliveryJob(options = {}) {
  const enabled =
    options.enabled ??
    !(
      process.env.WEBHOOK_DELIVERY_ENABLED === "0" ||
      process.env.WEBHOOK_DELIVERY_ENABLED === "false"
    );

  const intervalMs =
    options.intervalMs ??
    Number(process.env.WEBHOOK_DELIVERY_INTERVAL_MS ?? 5_000);
  const resolvedInterval =
    Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 5_000;

  workerState.configured = true;
  workerState.enabled = enabled;
  workerState.intervalMs = resolvedInterval;
  workerState.lastError = null;

  if (!enabled) {
    workerState.started = false;
    workerState.lastTickAt = null;
    return { stop() {} };
  }

  workerState.started = true;

  const run =
    options.run ??
    (async () => {
      try {
        await processPaymentOrderWebhookOutbox();
        await processDueWebhookDeliveries();
        workerState.lastTickAt = Date.now();
        workerState.lastError = null;
      } catch (err) {
        workerState.lastTickAt = Date.now();
        workerState.lastError =
          err instanceof Error ? err.message : String(err);
        if (process.env.NODE_ENV !== "test") {
          console.error("webhook delivery tick failed", err);
        }
      }
    });

  const handle = setInterval(() => {
    void run();
  }, resolvedInterval);
  if (typeof handle.unref === "function") handle.unref();

  void run();

  return {
    stop() {
      clearInterval(handle);
      workerState.started = false;
    },
  };
}
