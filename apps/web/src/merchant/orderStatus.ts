/** Canonical OrderStatus → UI label. Never "Paid". */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_payment: "Pending Payment",
  verifying: "Verifying",
  confirmed: "Confirmed",
  completed: "Completed",
  expired: "Expired",
  payment_anomaly: "Payment Anomaly",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function orderStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return ORDER_STATUS_LABELS[status] ?? status;
}

/** CSS modifier for status badge. */
export function orderStatusTone(status: string | null | undefined): string {
  switch (status) {
    case "completed":
    case "confirmed":
      return "ok";
    case "verifying":
    case "pending_payment":
      return "teal";
    case "expired":
    case "cancelled":
      return "muted";
    case "payment_anomaly":
    case "failed":
      return "anomaly";
    default:
      return "muted";
  }
}

export function formatExpiryRemaining(iso: string | null | undefined): string {
  if (!iso) return "—";
  const end = Date.parse(iso);
  if (!Number.isFinite(end)) return "—";
  const ms = end - Date.now();
  if (ms <= 0) return "expired";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} remaining`;
}

export function formatShortTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Heuristic confirmation fill when API does not expose n/N yet. */
export function confirmationProgress(status: string): { filled: number; total: number } {
  const total = 6;
  switch (status) {
    case "completed":
    case "confirmed":
      return { filled: total, total };
    case "verifying":
      return { filled: 2, total };
    case "payment_anomaly":
      return { filled: 1, total };
    default:
      return { filled: 0, total };
  }
}
