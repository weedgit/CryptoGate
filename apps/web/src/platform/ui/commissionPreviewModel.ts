import type { CommissionPreviewMerchant } from "../../shared/dashboardApi";

export function formatUsd2(n: number): string {
  return `$${(Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "2026-10-05" → "Oct 5" (UTC calendar date). */
export function formatUtcDay(isoDay: string | null | undefined): string {
  if (!isoDay) return "—";
  const d = new Date(`${isoDay.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return isoDay;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export type BillCell = {
  label: string;
  tone: "ok" | "warn" | "danger" | "muted";
  /** What the agent should know or do about this merchant's commission. */
  note: string;
  billId: string | null;
};

export function commissionBillCell(m: CommissionPreviewMerchant): BillCell {
  if (m.openBill) {
    const more = m.openBill.count > 1 ? ` (${m.openBill.count} bills)` : "";
    if (m.openBill.status === "overdue") {
      return {
        label: `Overdue ${formatUsd2(m.openBill.amountUsd)}${more}`,
        tone: "danger",
        note: "Unpaid, so it won't count until paid. Follow up with the merchant.",
        billId: m.openBill.id,
      };
    }
    return {
      label: `Unpaid ${formatUsd2(m.openBill.amountUsd)}${more}`,
      tone: "warn",
      note: m.openBill.dueAt
        ? `Due ${formatUtcDay(m.openBill.dueAt)}. Counts once paid.`
        : "Counts once paid.",
      billId: m.openBill.id,
    };
  }
  if (m.baseUsd > 0) {
    return { label: "Paid", tone: "ok", note: "Included in this month's commission.", billId: m.paidBillId };
  }
  if (m.status === "paused") {
    return { label: "Paused", tone: "muted", note: "Merchant is paused.", billId: null };
  }
  return { label: "No bill paid yet", tone: "muted", note: "Nothing paid this month yet.", billId: null };
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

export type ScheduleCell = {
  label: string;
  note: string;
  pending: boolean;
};

/** Next monthly bill date and the day of month it repeats on (UTC). */
export function billingScheduleCell(m: CommissionPreviewMerchant): ScheduleCell {
  if (!m.billingAnchorAt) {
    return { label: "Not activated", note: "Billing starts after activation.", pending: true };
  }
  const next = m.nextInvoiceOn ?? null;
  const day = Number((next ?? m.billingAnchorAt).slice(8, 10));
  const repeat = Number.isFinite(day) && day > 0 ? `Monthly on the ${ordinal(day)}` : "Monthly";
  const since = new Date(`${m.billingAnchorAt}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return {
    label: next ? `Next bill ${formatUtcDay(next)}` : repeat,
    note: next ? `${repeat} · since ${since}` : `Since ${since}`,
    pending: false,
  };
}

export function merchantStatusLabel(status: CommissionPreviewMerchant["status"]): string {
  if (status === "paused") return "Paused";
  if (status === "active") return "Active";
  return "No orders";
}
