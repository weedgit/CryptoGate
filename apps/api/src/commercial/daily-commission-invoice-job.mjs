import { msUntilNextUtcMidnight } from "../service-bills/billing-anchor-rules.mjs";
import { runDailyAgentCommissionInvoiceJob } from "./daily-commission-invoice.mjs";
import { emitDashboardLive } from "../events/dashboard-events-hub.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";

/**
 * Create agent commission invoices at 00:00 UTC on day C (agentPayDayStart).
 * Also catch-up once per process start while inside the remittance window.
 *
 * @param {{
 *   enabled?: boolean,
 *   run?: () => Promise<unknown>,
 *   now?: () => Date,
 * }} [options]
 */
export function startDailyAgentCommissionInvoiceJob(options = {}) {
  const enabled =
    options.enabled ??
    !(
      process.env.AGENT_COMMISSION_DAILY_INVOICE_ENABLED === "0" ||
      process.env.AGENT_COMMISSION_DAILY_INVOICE_ENABLED === "false"
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
        const result = await runDailyAgentCommissionInvoiceJob(nowFn());
        if (!result.ran) return;
        for (const row of result.created ?? []) {
          emitDashboardLive({
            type: "commission.issued",
            slices: ["commissions"],
            orgId: row.payee_org_id,
            parentId: row.payer_org_id ?? null,
          });
        }
        if ((result.created?.length ?? 0) > 0) {
          try {
            await insertAuditEvent({
              actorUserId: null,
              orgId: null,
              action: AUDIT_ACTIONS.commissionPayoutAuto,
              metadata: {
                today: result.today,
                periodKey: result.periodKey ?? null,
                reason: result.reason ?? null,
                created: result.created.length,
                skipped: result.skipped?.length ?? 0,
              },
            });
          } catch {
            /* audit must not block commission job */
          }
        }
        if (process.env.NODE_ENV !== "test" && (result.created?.length ?? 0) > 0) {
          console.log(
            `[commissions] daily invoice job ${result.today} period ${result.periodKey}: created ${result.created.length}, skipped ${result.skipped.length}`,
          );
        }
      } catch (err) {
        if (process.env.NODE_ENV !== "test") {
          console.error("daily agent commission invoice job failed", err);
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
