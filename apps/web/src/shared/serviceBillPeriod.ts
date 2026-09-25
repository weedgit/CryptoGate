import {
  formatUtcDateOnly,
  formatViewerDate,
} from "./dateTime";

/** Merchant must exist on or before billing period end (UTC) to be billable. */
export function merchantOnboardedInPeriod(
  createdAt: string | undefined,
  periodEnd: string,
): boolean {
  if (!periodEnd || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return true;
  if (!createdAt) return true;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return true;
  const periodEndMs = Date.parse(`${periodEnd}T23:59:59.999Z`);
  return created <= periodEndMs;
}

export function merchantsSkippedForPeriod(
  merchants: { id: string; createdAt?: string }[],
  periodEnd: string,
): { id: string; createdAt?: string }[] {
  return merchants.filter((m) => !merchantOnboardedInPeriod(m.createdAt, periodEnd));
}

/** MM/DD/YYYY — datetimes in viewer TZ; date-only strings as UTC calendar days. */
export function formatSlashDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const raw = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10)) && raw.length <= 10) {
    return formatUtcDateOnly(raw);
  }
  return formatViewerDate(raw);
}

/** Human label for a bill fee window (matches list Period column). */
export function formatServiceBillPeriodRange(
  periodStart: string | null | undefined,
  periodEnd?: string | null,
): string {
  const start = periodStart?.trim() ?? "";
  if (!start) return "—";
  const end = periodEnd?.trim() ?? "";
  if (!end || end === start) return formatUtcDateOnly(start);
  return `${formatUtcDateOnly(start)} ~ ${formatUtcDateOnly(end)}`;
}

export type ServiceBillPeriodOption = {
  start: string;
  end: string;
  label: string;
};

/** Unique periodStart values with a representative end for labels. */
export function serviceBillPeriodOptions(
  bills: { periodStart?: string | null; periodEnd?: string | null }[],
): ServiceBillPeriodOption[] {
  const byStart = new Map<string, string>();
  for (const bill of bills) {
    const start = bill.periodStart?.trim();
    if (!start) continue;
    if (!byStart.has(start)) {
      byStart.set(start, bill.periodEnd?.trim() || start);
    }
  }
  return [...byStart.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([start, end]) => ({
      start,
      end,
      label: formatServiceBillPeriodRange(start, end),
    }));
}

/** Expand a remittance reference into an EVM-looking 0x + 64 hex tx hash for display.
 * Real chain hashes (already 0x…64) pass through; legacy seed labels are remapped.
 * Used for service-bill payment refs and commission payout tx refs. */
export function displayServiceBillTxHash(
  ref: string | null | undefined,
): string {
  const t = ref?.trim() || "";
  if (!t) return "";
  if (/^0x[0-9a-fA-F]{64}$/.test(t)) return t.toLowerCase();
  // Deterministic FNV-1a expansion (demo / legacy seed labels only).
  let hex = "";
  let h = 2166136261 >>> 0;
  const seed = `pg-service-bill:${t}`;
  for (let i = 0; hex.length < 64; i += 1) {
    h ^= seed.charCodeAt(i % seed.length);
    h = Math.imul(h, 16777619) >>> 0;
    hex += h.toString(16).padStart(8, "0");
  }
  return `0x${hex.slice(0, 64)}`;
}

/** Short CTA shown on list rows that still need ops work. */
export function serviceBillManageHint(status: string): string | null {
  switch (status) {
    case "draft":
      return "Open to send";
    case "issued":
      return "Open to mark paid";
    case "overdue":
      return "Open to collect";
    default:
      return null;
  }
}
