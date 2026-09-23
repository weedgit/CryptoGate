/** Service bill status labels — separate rail from payment orders. */
export const SERVICE_BILL_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  paid: "Paid",
  overdue: "Overdue",
  voided: "Voided",
  cancelled: "Cancelled",
};

export function serviceBillStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return SERVICE_BILL_STATUS_LABELS[status] ?? status;
}

export function serviceBillStatusTone(status: string | null | undefined): string {
  switch (status) {
    case "paid":
      return "ok";
    case "draft":
      return "muted";
    case "issued":
      return "warn";
    case "overdue":
      return "anomaly";
    case "voided":
    case "cancelled":
      return "muted";
    default:
      return "muted";
  }
}

export function formatBillPeriod(start: string, end: string): string {
  return `${start} → ${end}`;
}

export function formatBillId(id: string): string {
  const short = id.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `SB-${short}`;
}

/** Activation fee bill (explicit kind or heuristic for older rows). */
export function isActivationServiceBill(bill: {
  billKind?: string | null;
  periodStart?: string;
  periodEnd?: string;
  volumeFeeAmount?: string;
  billedVolumeUsd?: string | null;
}): boolean {
  if (bill.billKind === "activation") return true;
  if (bill.billKind === "monthly") return false;
  return (
    Boolean(bill.periodStart) &&
    bill.periodStart === bill.periodEnd &&
    Number(bill.volumeFeeAmount ?? 0) === 0 &&
    Number(bill.billedVolumeUsd ?? 0) === 0
  );
}

export function isOpenActivationServiceBill(bill: {
  billKind?: string | null;
  status: string;
  periodStart?: string;
  periodEnd?: string;
  volumeFeeAmount?: string;
  billedVolumeUsd?: string | null;
}): boolean {
  return (
    isActivationServiceBill(bill) &&
    !["paid", "voided", "cancelled"].includes(bill.status)
  );
}
