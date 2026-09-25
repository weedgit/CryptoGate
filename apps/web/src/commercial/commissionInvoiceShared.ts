import { platformFeeNetwork } from "../shared/platformFeePair";
import type { CommissionPayoutRecord } from "./commissionPayoutRecords";

export type CommissionInvoiceDest = {
  address: string;
  asset: string;
  network: string;
};

export type SlipTimelineStep = {
  id: string;
  label: string;
  state: "done" | "current" | "todo";
};

export function slipLifecycleSteps(payoutStatus: string): SlipTimelineStep[] {
  const issued =
    payoutStatus === "issued" ||
    payoutStatus === "paid" ||
    payoutStatus === "settled";
  const paid = payoutStatus === "paid" || payoutStatus === "settled";
  const settled = payoutStatus === "settled";
  return [
    {
      id: "issued",
      label: "Issued",
      state: settled || paid ? "done" : issued ? "current" : "todo",
    },
    {
      id: "paid",
      label: "Paid",
      state: settled ? "done" : paid ? "current" : issued ? "todo" : "todo",
    },
    {
      id: "settled",
      label: "Settled",
      state: settled ? "done" : "todo",
    },
  ];
}

export function remittanceNetwork(record: {
  network?: string | null;
}): string {
  const n = record.network?.trim().toLowerCase();
  return n || platformFeeNetwork();
}

export function invoiceStatusTone(status: string): string {
  if (status === "issued") return "issued";
  if (status === "paid") return "paid";
  if (status === "settled") return "settled";
  return status;
}

export function invoiceStatusLabel(status: string): string {
  if (status === "issued") return "Issued";
  if (status === "paid") return "Paid (awaiting confirm)";
  if (status === "settled") return "Settled";
  return status;
}

export function destForInvoice(
  slip: CommissionPayoutRecord,
  fallback?: CommissionInvoiceDest | null,
): CommissionInvoiceDest | null {
  if (slip.payoutAddress) {
    return {
      address: slip.payoutAddress,
      asset: slip.asset ?? "USDT",
      network: slip.network ?? "tron",
    };
  }
  return fallback ?? null;
}

export function displayCommissionInvoiceId(id: string): string {
  const compact = id.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `CI-${compact}`;
}
