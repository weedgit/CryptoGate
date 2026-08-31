export type DashboardPeriodId = "today" | "7d" | "1m" | "mtd";

export const DASHBOARD_PERIOD_OPTIONS: {
  id: DashboardPeriodId;
  label: string;
}[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7d" },
  { id: "mtd", label: "MTD" },
];

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateInput(value: string, end = false): Date {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return end ? endOfDay(date) : startOfDay(date);
}

export function periodWindow(id: DashboardPeriodId): { from: Date; to: Date } {
  const now = new Date();
  const to = endOfDay(now);
  if (id === "today") return { from: startOfDay(now), to };
  if (id === "mtd") {
    const from = startOfDay(now);
    from.setDate(1);
    return { from, to };
  }
  const from = startOfDay(now);
  const days = id === "7d" ? 6 : 29;
  from.setDate(from.getDate() - days);
  return { from, to };
}

export function buildDayKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cur = startOfDay(from);
  const end = startOfDay(to);
  while (cur <= end) {
    keys.push(toDateInputValue(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return keys.length ? keys : [toDateInputValue(from)];
}

export function dayKeyFromIso(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return toDateInputValue(new Date(t));
}

export function inWindow(iso: string, from: Date, to: Date): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= from.getTime() && t <= to.getTime();
}

export function periodLabel(
  period: DashboardPeriodId | "custom",
  startDate: string,
  endDate: string,
): string {
  if (period === "custom") return `${startDate} – ${endDate}`;
  return (
    DASHBOARD_PERIOD_OPTIONS.find((p) => p.id === period)?.label ?? period
  );
}
