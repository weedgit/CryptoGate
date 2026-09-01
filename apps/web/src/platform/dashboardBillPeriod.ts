import type { ServiceBill } from "./api";

function inWindow(iso: string | null | undefined, from: Date, to: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= from.getTime() && t <= to.getTime();
}

/** Service bill counts toward dashboard period stats. */
export function serviceBillInPeriod(
  bill: ServiceBill,
  from: Date,
  to: Date,
): boolean {
  if (inWindow(bill.createdAt, from, to)) return true;
  if (inWindow(bill.dueAt, from, to)) return true;
  if (inWindow(bill.periodStart, from, to)) return true;
  const periodStart = Date.parse(bill.periodStart);
  const periodEnd = Date.parse(bill.periodEnd);
  if (Number.isFinite(periodStart) && Number.isFinite(periodEnd)) {
    return periodStart <= to.getTime() && periodEnd >= from.getTime();
  }
  return false;
}

/** Volume fees billed in period (issued / due / overlapping billing period). */
export function feeAccruedFromBills(
  bills: ServiceBill[],
  from: Date,
  to: Date,
): number {
  let total = 0;
  for (const bill of bills) {
    if (bill.status === "void") continue;
    if (!serviceBillInPeriod(bill, from, to)) continue;
    const n = Number(bill.volumeFeeAmount);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

export function invoiceStatsFromBills(
  bills: ServiceBill[],
  from: Date,
  to: Date,
) {
  let issued = 0;
  let paid = 0;
  let overdue = 0;
  for (const bill of bills) {
    if (bill.status === "void") continue;
    if (serviceBillInPeriod(bill, from, to)) issued += 1;
    if (bill.status === "paid" && inWindow(bill.paidAt ?? bill.dueAt, from, to)) {
      paid += 1;
    }
    if (bill.status === "overdue") overdue += 1;
  }
  return { issued, paid, overdue };
}
