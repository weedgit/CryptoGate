import { msUntilNextUtcMidnight } from "./billing-anchor-rules.mjs";
import { runDailyServiceBillInvoiceJob } from "./daily-invoice.mjs";
import { emitDashboardLive } from "../events/dashboard-events-hub.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";

/**
 * Create recurring service bills at 00:00 UTC every day.
 * @param {{
 *   enabled?: boolean,
 *   run?: () => Promise<unknown>,
 *   now?: () => Date,
 * }} [options]
 */
export function startDailyServiceBillInvoiceJob(options = {}) {
  const enabled =
    options.enabled ??
    !(
      process.env.SERVICE_BILL_DAILY_INVOICE_ENABLED === "0" ||
      process.env.SERVICE_BILL_DAILY_INVOICE_ENABLED === "false"
    );
  if (!enabled) {
    return { stop() {} };
  }

  const nowFn = options.now ?? (() => new Date());
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timeoutHandle = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let intervalHandle = null;
  let stopped = false;

  const run =
    options.run ??
    (async () => {
      try {
        const result = await runDailyServiceBillInvoiceJob(nowFn());
        for (const bill of result.created) {
          emitDashboardLive({
            type: "service_bill.draft",
            slices: ["serviceBills"],
            orgId: bill.org_id,
          });
        }
        if (result.created.length > 0) {
          try {
            await insertAuditEvent({
              actorUserId: null,
              orgId: null,
              action: AUDIT_ACTIONS.serviceBillDailyAuto,
              metadata: {
                today: result.today,
                created: result.created.length,
                skipped: result.skipped.length,
              },
            });
          } catch {
            /* audit must not block invoice job */
          }
        }
        if (process.env.NODE_ENV !== "test" && result.created.length) {
          console.log(
            `[service-bills] daily invoice job ${result.today}: created ${result.created.length}, skipped ${result.skipped.length}`,
          );
        }
      } catch (err) {
        if (process.env.NODE_ENV !== "test") {
          console.error("daily service bill invoice job failed", err);
        }
      }
    });

  function scheduleNext() {
    if (stopped) return;
    const wait = msUntilNextUtcMidnight(nowFn());
    timeoutHandle = setTimeout(() => {
      void run();
      intervalHandle = setInterval(
        () => {
          void run();
        },
        24 * 60 * 60 * 1000,
      );
      if (typeof intervalHandle.unref === "function") intervalHandle.unref();
    }, wait === 0 ? 1000 : wait);
    if (typeof timeoutHandle.unref === "function") timeoutHandle.unref();
  }

  scheduleNext();
  void run();

  return {
    stop() {
      stopped = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (intervalHandle) clearInterval(intervalHandle);
    },
  };
}
