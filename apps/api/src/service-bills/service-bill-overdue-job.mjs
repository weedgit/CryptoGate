import { markOverdueServiceBills } from "./service-bill-overdue.mjs";

/**
 * @param {{
 *   intervalMs?: number,
 *   enabled?: boolean,
 *   run?: () => Promise<unknown>,
 * }} [options]
 */
export function startServiceBillOverdueJob(options = {}) {
  const enabled =
    options.enabled ??
    !(
      process.env.SERVICE_BILL_OVERDUE_ENABLED === "0" ||
      process.env.SERVICE_BILL_OVERDUE_ENABLED === "false"
    );
  if (!enabled) {
    return { stop() {} };
  }

  const intervalMs =
    options.intervalMs ??
    Number(process.env.SERVICE_BILL_OVERDUE_INTERVAL_MS ?? 60_000);

  const run =
    options.run ??
    (async () => {
      try {
        await markOverdueServiceBills();
      } catch (err) {
        if (process.env.NODE_ENV !== "test") {
          console.error("service bill overdue tick failed", err);
        }
      }
    });

  const handle = setInterval(() => {
    void run();
  }, Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 60_000);
  if (typeof handle.unref === "function") handle.unref();

  void run();

  return {
    stop() {
      clearInterval(handle);
    },
  };
}
