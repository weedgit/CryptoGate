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

/** Plain-language anomaly cause (staff + invoice). */
const ANOMALY_REASON_LABELS: Record<string, string> = {
  mode_b_same_amount_collision: "Two open tickets shared the same amount",
  mode_s_same_amount_collision: "Two open tickets shared the same amount (HD pool)",
  mode_b_underpay: "Amount received was less than expected",
  mode_b_overpay: "Amount received was more than expected",
  underpay: "Amount received was less than expected",
  overpay: "Amount received was more than expected",
  wrong_network: "Payment arrived on the wrong network",
  wrong_network_or_asset: "Payment asset or network does not match this order",
  late_payment_after_expiry: "Payment arrived after the order expired",
  duplicate_payment: "A second payment was detected for this order",
  delayed_arrival: "Payment arrived late",
  no_exact_amount_match: "No open order matched this exact amount",
};

/** What staff should do after reading the reason. */
const ANOMALY_GUIDANCE: Record<string, string> = {
  mode_b_same_amount_collision:
    "Check which customer paid and settle in your own books if needed. Then Resolve with a short note. CryptoGate will not guess which ticket the payment belongs to.",
  mode_s_same_amount_collision:
    "Check which customer paid and settle in your own books if needed. Then Resolve with a short note. CryptoGate will not guess which ticket the payment belongs to.",
  mode_b_underpay:
    "Confirm with the customer whether they will send the rest or you accept a partial. Record the outcome when you Resolve — there is no Mark paid.",
  mode_b_overpay:
    "Confirm excess with the customer and handle any refund in your own wallet. Record the outcome when you Resolve — there is no Mark paid.",
  underpay:
    "Confirm with the customer whether they will send the rest or you accept a partial. Record the outcome when you Resolve — there is no Mark paid.",
  overpay:
    "Confirm excess with the customer and handle any refund in your own wallet. Record the outcome when you Resolve — there is no Mark paid.",
  wrong_network:
    "Funds on the wrong network may be difficult or impossible to recover. Check the explorer, contact the payer, then Resolve with what you found.",
  wrong_network_or_asset:
    "Funds may not belong to this ticket. Check the explorer, contact the payer, then Resolve with what you found.",
  late_payment_after_expiry:
    "Decide with the customer how to treat the late funds in your books, then Resolve this ticket with a note.",
  duplicate_payment:
    "Verify both transactions on the explorer. Handle any extra receipt in your own books, then Resolve with a note.",
  delayed_arrival:
    "Confirm the tx on the explorer and how you treated it in your books, then Resolve with a note.",
  no_exact_amount_match:
    "This payment did not match an open ticket amount. Identify the payer off-platform if needed, then Resolve with a note.",
};

const DEFAULT_ANOMALY_GUIDANCE =
  "Reconcile manually using the chain explorer and your own books, then Resolve with a short note. There is no Mark paid action.";

/** Human-readable payment anomaly cause for alerts and order detail. */
export function anomalyReasonLabel(reason: string | null | undefined): string | null {
  if (!reason?.trim()) return null;
  const key = reason.trim().toLowerCase();
  return ANOMALY_REASON_LABELS[key] ?? key.replace(/_/g, " ");
}

/** Staff guidance for the anomaly reason (detail panel / invoice). */
export function anomalyGuidance(reason: string | null | undefined): string {
  if (!reason?.trim()) return DEFAULT_ANOMALY_GUIDANCE;
  const key = reason.trim().toLowerCase();
  return ANOMALY_GUIDANCE[key] ?? DEFAULT_ANOMALY_GUIDANCE;
}

/**
 * Plain-language Why + What to do for staff.
 * When anomaly_reason was never stored (older tickets), infers from amounts/mode.
 */
export function anomalyExplain(input: {
  reason?: string | null;
  matchingMode?: string | null;
  payableAmount?: string | null;
  receivedAmount?: string | null;
  hasTx?: boolean;
}): { title: string; guidance: string; inferred: boolean } {
  const labeled = anomalyReasonLabel(input.reason);
  if (labeled) {
    return {
      title: labeled,
      guidance: anomalyGuidance(input.reason),
      inferred: false,
    };
  }

  const expected = Number(String(input.payableAmount ?? "").trim());
  const received = Number(String(input.receivedAmount ?? "").trim());
  const amountsKnown = Number.isFinite(expected) && Number.isFinite(received);

  if (amountsKnown && received < expected) {
    return {
      title: "Amount received was less than expected",
      guidance: anomalyGuidance("mode_b_underpay"),
      inferred: true,
    };
  }
  if (amountsKnown && received > expected) {
    return {
      title: "Amount received was more than expected",
      guidance: anomalyGuidance("mode_b_overpay"),
      inferred: true,
    };
  }
  if (amountsKnown && received === expected) {
    return {
      title: "Amounts match, but this ticket was flagged for review",
      guidance:
        "Expected and received are the same, so this is not an under/overpay. A true same-amount collision only happens when two open tickets share one address and one amount at the same time — CryptoGate then cannot tell which customer paid. On older/demo tickets the exact cause code may be missing. Check the explorer and your counter log, then Resolve with a note.",
      inferred: true,
    };
  }
  if (!input.hasTx) {
    return {
      title: "Flagged for review (no on-chain tx recorded yet)",
      guidance: DEFAULT_ANOMALY_GUIDANCE,
      inferred: true,
    };
  }
  return {
    title: "Payment flagged for review — exact cause was not recorded on this ticket",
    guidance: DEFAULT_ANOMALY_GUIDANCE,
    inferred: true,
  };
}

/** Expected vs received line for alerts / invoice. */
export function anomalyAmountLine(input: {
  payableAmount?: string | null;
  receivedAmount?: string | null;
  asset?: string | null;
}): string | null {
  const asset = input.asset?.trim() || "";
  const expected = input.payableAmount?.trim();
  const received = input.receivedAmount?.trim();
  if (!expected && !received) return null;
  if (expected && received) {
    return `Expected ${expected}${asset ? ` ${asset}` : ""}, received ${received}${asset ? ` ${asset}` : ""}.`;
  }
  if (expected) {
    return `Expected ${expected}${asset ? ` ${asset}` : ""}.`;
  }
  return `Received ${received}${asset ? ` ${asset}` : ""}.`;
}

export type OrderStatusContext = {
  anomalyResolvedAt?: string | null;
  anomalyResolutionNote?: string | null;
};

/** True when cancelled after staff resolved a payment anomaly. */
export function isAnomalyResolved(
  status: string | null | undefined,
  ctx?: OrderStatusContext | null,
): boolean {
  if (status !== "cancelled" || !ctx) return false;
  return Boolean(
    (ctx.anomalyResolvedAt && String(ctx.anomalyResolvedAt).trim()) ||
      (ctx.anomalyResolutionNote && String(ctx.anomalyResolutionNote).trim()),
  );
}

export function orderStatusLabel(
  status: string | null | undefined,
  ctx?: OrderStatusContext | null,
): string {
  if (!status) return "—";
  if (isAnomalyResolved(status, ctx)) return "Resolved";
  return ORDER_STATUS_LABELS[status] ?? status;
}

/** CSS modifier for status badge. */
/** Figma 02 Status Badges: pending=amber, verifying=teal, done=ok, anomaly/failed=coral. */
export function orderStatusTone(
  status: string | null | undefined,
  ctx?: OrderStatusContext | null,
): string {
  if (isAnomalyResolved(status, ctx)) return "teal";
  switch (status) {
    case "completed":
    case "confirmed":
      return "ok";
    case "verifying":
      return "teal";
    case "pending_payment":
      return "warn";
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

/** Confirmation fill from order payment details / asset-network registry. */
export function confirmationProgress(input: {
  status: string;
  requiredConfirmations: number;
  confirmations?: number;
  hasTx?: boolean;
}): { filled: number; total: number } {
  const total = Math.max(1, Math.floor(input.requiredConfirmations) || 1);
  const status = input.status;
  if (status === "completed" || status === "confirmed") {
    return { filled: total, total };
  }
  const fromApi = Number(input.confirmations);
  if (Number.isFinite(fromApi) && fromApi >= 0) {
    return { filled: Math.min(Math.floor(fromApi), total), total };
  }
  if (status === "verifying") {
    return { filled: Math.min(2, total), total };
  }
  if (status === "payment_anomaly" && input.hasTx) {
    return { filled: Math.min(1, total), total };
  }
  return { filled: 0, total };
}
