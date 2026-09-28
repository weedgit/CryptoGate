import type { PaymentOrder } from "../api";
import { formatDocumentDateTime } from "../../shared/dateTime";

const MAX_AMOUNT_DIGITS = 9;

/** Fiat keypad entry: digits, one dot, at most 2 decimals. */
export function applyPadKey(current: string, key: string): string {
  if (key === "back") return current.slice(0, -1);
  if (key === "clear") return "";
  if (key === ".") {
    if (current.includes(".")) return current;
    return current === "" ? "0." : `${current}.`;
  }
  if (!/^\d$/.test(key)) return current;
  const [whole, fraction] = current.split(".");
  if (fraction !== undefined && fraction.length >= 2) return current;
  if (fraction === undefined && whole.length >= MAX_AMOUNT_DIGITS) return current;
  if (current === "0") return key;
  return `${current}${key}`;
}

export type PaymentPhase = "waiting" | "confirming" | "paid" | "attention" | "closed";

export function paymentPhase(status: string | undefined): PaymentPhase {
  if (status === "pending_payment") return "waiting";
  if (status === "verifying" || status === "confirmed") return "confirming";
  if (status === "completed") return "paid";
  if (status === "payment_anomaly") return "attention";
  return "closed";
}

export type ReceiptInput = {
  merchantName: string | null | undefined;
  orderNumber: string;
  paidAt: string | null | undefined;
  invoiceAmount: string | null | undefined;
  invoiceCurrency: string | null | undefined;
  cryptoAmount: string;
  asset: string;
  networkLabel: string;
  txHash: string | null | undefined;
  reference: string | null | undefined;
  /** Merchant/site business zone; falls back to the cashier's zone. */
  timeZone?: string | null;
};

/** Customer receipt as label/value rows (print layout and share text use the same rows). */
export function receiptRows(r: ReceiptInput): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [
    { label: "Order", value: `#${r.orderNumber}` },
  ];
  const paid = r.paidAt ? new Date(r.paidAt) : null;
  if (paid && Number.isFinite(paid.getTime())) {
    rows.push({ label: "Paid", value: formatDocumentDateTime(paid, r.timeZone) });
  }
  if (r.invoiceAmount) {
    rows.push({ label: "Amount", value: `${r.invoiceAmount} ${r.invoiceCurrency || "USD"}` });
  }
  rows.push({ label: "Paid with", value: `${r.cryptoAmount} ${r.asset} · ${r.networkLabel}` });
  if (r.reference?.trim()) rows.push({ label: "Reference", value: r.reference.trim() });
  if (r.txHash) rows.push({ label: "Transaction", value: r.txHash });
  return rows;
}

export function receiptText(r: ReceiptInput): string {
  const head = `${r.merchantName?.trim() || "Payment"} — receipt`;
  return [head, ...receiptRows(r).map((row) => `${row.label}: ${row.value}`)].join("\n");
}

export const OPEN_ORDER_STATUSES = new Set(["pending_payment", "verifying", "confirmed"]);

/** Shift totals from the listed orders (the cashier's own, today). */
export function shiftTotals(orders: Pick<PaymentOrder, "status" | "invoiceAmountUsd">[]) {
  let completed = 0;
  let completedUsd = 0;
  let open = 0;
  let attention = 0;
  for (const o of orders) {
    if (o.status === "completed") {
      completed += 1;
      completedUsd += Number(o.invoiceAmountUsd ?? 0) || 0;
    } else if (OPEN_ORDER_STATUSES.has(o.status)) {
      open += 1;
    } else if (o.status === "payment_anomaly") {
      attention += 1;
    }
  }
  return { count: orders.length, completed, completedUsd, open, attention };
}
