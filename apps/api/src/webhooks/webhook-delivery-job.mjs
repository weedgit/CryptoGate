import { processDueWebhookDeliveries } from "./webhook-deliver.mjs";
import { processPaymentOrderWebhookOutbox } from "./webhook-fanout.mjs";

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
  if (!enabled) {
    return { stop() {} };
  }

  const intervalMs =
    options.intervalMs ??
    Number(process.env.WEBHOOK_DELIVERY_INTERVAL_MS ?? 5_000);

  const run =
    options.run ??
    (async () => {
      try {
        await processPaymentOrderWebhookOutbox();
        await processDueWebhookDeliveries();
      } catch (err) {
        if (process.env.NODE_ENV !== "test") {
          console.error("webhook delivery tick failed", err);
        }
      }
    });

  const handle = setInterval(() => {
    void run();
  }, Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 5_000);
  if (typeof handle.unref === "function") handle.unref();

  void run();

  return {
    stop() {
      clearInterval(handle);
    },
  };
}
