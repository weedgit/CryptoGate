/**
 * Background: purge terminal payment orders past each merchant's orderDeleteDays.
 * @param {{
 *   intervalMs?: number,
 *   enabled?: boolean,
 *   run?: () => Promise<unknown>,
 * }} [options]
 */
export function startOrderRetentionPurgeJob(options = {}) {
  const enabled =
    options.enabled ??
    !(
      process.env.ORDER_RETENTION_PURGE_ENABLED === "0" ||
      process.env.ORDER_RETENTION_PURGE_ENABLED === "false"
    );
  if (!enabled) {
    return { stop() {} };
  }

  const intervalMs =
    options.intervalMs ??
    Number(process.env.ORDER_RETENTION_PURGE_INTERVAL_MS ?? 3_600_000);

  const run =
    options.run ??
    (async () => {
      try {
        const { purgeExpiredPaymentOrders } = await import(
          "./order-retention-purge.mjs"
        );
        const batchSize = Number(
          process.env.ORDER_RETENTION_PURGE_BATCH ?? 500,
        );
        const result = await purgeExpiredPaymentOrders({ batchSize });
        if (result.deleted > 0 && process.env.NODE_ENV !== "test") {
          console.info(
            `[retention] purged ${result.deleted} order(s) across ${result.merchants} merchant(s)`,
          );
        }
      } catch (err) {
        if (process.env.NODE_ENV !== "test") {
          console.error("order retention purge tick failed", err);
        }
      }
    });

  const handle = setInterval(() => {
    void run();
  }, Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 3_600_000);
  if (typeof handle.unref === "function") handle.unref();

  void run();

  return {
    stop() {
      clearInterval(handle);
    },
  };
}
