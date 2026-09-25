import type { ServiceBill } from "./api";

function inWindow(iso: string | null | undefined, from: Date, to: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= from.getTime() && t <= to.getTime();
}

/** Paid platform fee on one bill: subscription + volume (matches commission base). */
function platformFeeFromBill(bill: {
  subscriptionAmount?: string | null;
  volumeFeeAmount?: string | null;
}): number {
  const sub = Number(bill.subscriptionAmount ?? 0);
  const vol = Number(bill.volumeFeeAmount ?? 0);
  const s = Number.isFinite(sub) ? sub : 0;
  const v = Number.isFinite(vol) ? vol : 0;
  const total = Math.round((s + v) * 100) / 100;
  return total > 0 ? total : 0;
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

/** Platform fees billed in period (subscription + volume; void excluded). */
export function feeAccruedFromBills(
  bills: ServiceBill[],
  from: Date,
  to: Date,
): number {
  let total = 0;
  for (const bill of bills) {
    if (bill.status === "void") continue;
    if (!serviceBillInPeriod(bill, from, to)) continue;
    total += platformFeeFromBill(bill);
  }
  return Math.round(total * 100) / 100;
}

/** Platform fees paid in period (subscription + volume on paid bills). */
export function feeCollectedFromBills(
  bills: ServiceBill[],
  from: Date,
  to: Date,
  orgScope?: Set<string> | null,
): number {
  let total = 0;
  for (const bill of bills) {
    if (bill.status !== "paid") continue;
    if (orgScope && !orgScope.has(bill.orgId)) continue;
    if (!inWindow(bill.paidAt ?? bill.dueAt, from, to)) continue;
    total += platformFeeFromBill(bill);
  }
  return Math.round(total * 100) / 100;
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
    // Period-scoped: overdue only if due date or billing period touches the window.
    if (
      bill.status === "overdue" &&
      (inWindow(bill.dueAt, from, to) || serviceBillInPeriod(bill, from, to))
    ) {
      overdue += 1;
    }
  }
  return { issued, paid, overdue };
}
