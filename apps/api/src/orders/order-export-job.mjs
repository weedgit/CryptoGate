import {
  claimNextInvoiceExportJob,
  expireInvoiceExportJobs,
  processInvoiceExportJob,
} from "./order-export-store.mjs";

/**
 * Background worker: claim queued invoice CSV exports and write files.
 * @param {{
 *   intervalMs?: number,
 *   enabled?: boolean,
 * }} [options]
 */
export function startInvoiceExportJob(options = {}) {
  const enabled =
    options.enabled ??
    !(
      process.env.INVOICE_EXPORT_JOB_ENABLED === "0" ||
      process.env.INVOICE_EXPORT_JOB_ENABLED === "false"
    );

  const intervalMs =
    options.intervalMs ??
    Number(process.env.INVOICE_EXPORT_JOB_INTERVAL_MS ?? 3_000);
  const resolvedInterval =
    Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 3_000;

  if (!enabled) {
    return { stop() {} };
  }

  const run = async () => {
    try {
      await expireInvoiceExportJobs();
      const job = await claimNextInvoiceExportJob();
      if (job) await processInvoiceExportJob(job);
    } catch (err) {
      if (process.env.NODE_ENV !== "test") {
        console.error("invoice export tick failed", err);
      }
    }
  };

  const handle = setInterval(() => {
    void run();
  }, resolvedInterval);
  if (typeof handle.unref === "function") handle.unref();
  void run();

  return {
    stop() {
      clearInterval(handle);
    },
  };
}
