import type { CommissionPayoutSortKey } from "../../shared/commissionsServer";

export type StatusFilter = "all" | "issued" | "paid" | "settled";

export type StatusNavItem = {
  id: StatusFilter;
  label: string;
  children?: StatusNavItem[];
};

export type InvoiceSortKey =
  | "period"
  | "agent"
  | "fee"
  | "rate"
  | "commission"
  | "status"
  | "tx"
  | "paidAt";

export type HistorySortKey =
  | "paidAt"
  | "period"
  | "agent"
  | "amount"
  | "address"
  | "tx"
  | "status";

export const STATUS_NAV: StatusNavItem[] = [
  {
    id: "all",
    label: "All",
    children: [
      { id: "issued", label: "Issued" },
      { id: "paid", label: "Awaiting" },
      { id: "settled", label: "Settled" },
    ],
  },
];

export const PAGE_SIZE = 10;
/** Server cap for POST /commission-payouts/mark-paid-batch. */
export const BATCH_MARK_PAID_MAX = 50;
export const PERIOD_KEY_RE = /^\d{4}-\d{2}$/;

export function statusNavContains(
  item: StatusNavItem,
  filter: StatusFilter,
): boolean {
  if (item.id === filter) return true;
  return Boolean(item.children?.some((child) => statusNavContains(child, filter)));
}

export const HISTORY_SORT_SERVER: Record<HistorySortKey, CommissionPayoutSortKey> = {
  paidAt: "settledAt",
  period: "period",
  agent: "agent",
  amount: "commission",
  address: "address",
  tx: "tx",
  status: "status",
};

export function listStatusForView(status: StatusFilter): string | string[] {
  if (status === "settled") return "settled";
  if (status === "issued") return "issued";
  if (status === "paid") return "paid";
  return ["issued", "paid", "settled"];
}

export function parseStatusFilter(
  statusRaw: string | null,
  tabRaw: string | null,
): StatusFilter {
  if (
    statusRaw === "all" ||
    statusRaw === "issued" ||
    statusRaw === "paid" ||
    statusRaw === "settled"
  ) {
    return statusRaw;
  }
  if (tabRaw === "history") return "settled";
  return "all";
}

export function commissionBadgeTone(status: string): string {
  if (status === "issued") return "warn";
  if (status === "paid") return "teal";
  if (status === "settled") return "ok";
  return "muted";
}

export function commissionStatusLabel(status: string): string {
  if (status === "issued") return "Issued";
  if (status === "paid") return "Awaiting";
  if (status === "settled") return "Settled";
  return status;
}

export function orgIconMap(
  orgs: { id: string; iconKey?: string | null }[],
): Map<string, string | null> {
  return new Map(orgs.map((o) => [o.id, o.iconKey ?? null]));
}
