import { getBillingCalendarSettings } from "../platform-settings/billing-calendar-store.mjs";
import {
  generateMonthlyCommissionInvoices,
  isAgentCommissionCatchUpDay,
  isAgentCommissionInvoiceDay,
  previousCommissionPeriodKey,
} from "./commission-invoice-generate.mjs";

/**
 * On agent pay day C (and catch-up within remittance window): create issued
 * platform → agent commission invoices for the prior UTC month.
 * Base = paid merchant subscription + volume fees (activation excluded).
 *
 * @param {Date} [now]
 */
export async function runDailyAgentCommissionInvoiceJob(now = new Date()) {
  const calendar = await getBillingCalendarSettings();
  const dayC = calendar.agentPayDayStart;
  const dayEnd = calendar.agentPayDayEnd;
  const onCreateDay = isAgentCommissionInvoiceDay(now, dayC);
  const inCatchUp = isAgentCommissionCatchUpDay(now, dayC, dayEnd);
  if (!onCreateDay && !inCatchUp) {
    return {
      ran: false,
      reason: "not_agent_pay_day",
      today: now.toISOString().slice(0, 10),
      agentPayDayStart: dayC,
    };
  }

  const periodKey = previousCommissionPeriodKey(now);
  const result = await generateMonthlyCommissionInvoices(periodKey);
  return {
    ran: true,
    reason: onCreateDay ? "invoice_day" : "catch_up",
    today: now.toISOString().slice(0, 10),
    agentPayDayStart: dayC,
    ...result,
  };
}
