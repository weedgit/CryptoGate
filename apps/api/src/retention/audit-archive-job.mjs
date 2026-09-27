/**
 * Background: archive audit_log rows older than AUDIT_HOT_RETENTION_DAYS.
 * @param {{
 *   intervalMs?: number,
 *   enabled?: boolean,
 *   run?: () => Promise<unknown>,
 * }} [options]
 */
export function startAuditArchiveJob(options = {}) {
  const enabled =
    options.enabled ??
    !(
      process.env.AUDIT_ARCHIVE_ENABLED === "0" ||
      process.env.AUDIT_ARCHIVE_ENABLED === "false"
    );
  if (!enabled) {
    return { stop() {} };
  }

  const intervalMs =
    options.intervalMs ??
    Number(process.env.AUDIT_ARCHIVE_INTERVAL_MS ?? 3_600_000);

  const run =
    options.run ??
    (async () => {
      try {
        const { archiveOldAuditLog } = await import("./audit-archive.mjs");
        const batchSize = Number(process.env.AUDIT_ARCHIVE_BATCH ?? 1000);
        const result = await archiveOldAuditLog({ batchSize });
        if (result.archived > 0 && process.env.NODE_ENV !== "test") {
          console.info(
            `[retention] archived ${result.archived} audit row(s) before ${result.cutoff}`,
          );
        }
      } catch (err) {
        if (process.env.NODE_ENV !== "test") {
          console.error("audit archive tick failed", err);
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
