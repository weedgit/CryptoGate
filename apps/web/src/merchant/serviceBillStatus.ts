/** Service bill status labels — separate rail from payment orders. */
export const SERVICE_BILL_STATUS_LABELS: Record<string, string> = {
  issued: "Issued",
  paid: "Paid",
  overdue: "Overdue",
  voided: "Voided",
};

export function serviceBillStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return SERVICE_BILL_STATUS_LABELS[status] ?? status;
}

export function serviceBillStatusTone(status: string | null | undefined): string {
  switch (status) {
    case "paid":
      return "ok";
    case "issued":
      return "teal";
    case "overdue":
      return "anomaly";
    case "voided":
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
