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

function formatPeriodDay(iso: string): string {
  // Date-only YYYY-MM-DD → parse as UTC noon to avoid TZ day shift.
  const raw = iso.trim().slice(0, 10);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? Date.parse(`${raw}T12:00:00.000Z`)
    : Date.parse(iso);
  if (!Number.isFinite(d)) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** Human label for a bill fee window (matches list Period column). */
export function formatServiceBillPeriodRange(
  periodStart: string | null | undefined,
  periodEnd?: string | null,
): string {
  const start = periodStart?.trim() ?? "";
  if (!start) return "—";
  const end = periodEnd?.trim() ?? "";
  if (!end || end === start) return formatPeriodDay(start);
  return `${formatPeriodDay(start)} → ${formatPeriodDay(end)}`;
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
