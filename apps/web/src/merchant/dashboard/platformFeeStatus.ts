import { formatUtcDay } from "../../platform/ui/commissionPreviewModel";

export type PlatformFeeStatus = {
  label: string;
  tone: "ok" | "warn" | "danger" | "muted";
  schedule: string;
};

type Input = {
  billingAnchorAt?: string | null;
  nextInvoiceOn?: string | null;
  waivedMonthsLeft?: number | null;
  openBills: number;
  overdueBills: number;
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Platform Fee card footer: bill status badge + next bill date (bills issue 00:00 UTC). */
export function platformFeeStatus(input: Input): PlatformFeeStatus {
  if (!input.billingAnchorAt) {
    return {
      label: "Not activated",
      tone: "muted",
      schedule: "Billing starts after activation",
    };
  }
  const schedule = input.nextInvoiceOn
    ? `Next bill ${formatUtcDay(input.nextInvoiceOn)}`
    : "Billed monthly";
  if (input.overdueBills > 0) {
    return { label: `Overdue · ${plural(input.overdueBills, "bill")}`, tone: "danger", schedule };
  }
  if (input.openBills > 0) {
    return { label: `Unpaid · ${plural(input.openBills, "bill")}`, tone: "warn", schedule };
  }
  const waived = input.waivedMonthsLeft ?? 0;
  if (waived > 0) {
    return {
      label: "Waived",
      tone: "muted",
      schedule: `${schedule} · ${plural(waived, "month")} waived left`,
    };
  }
  return { label: "Paid up", tone: "ok", schedule };
}
