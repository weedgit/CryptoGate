import {
  addDaysYmd,
  addMonthsYmd,
  zonedEndOfDay,
  zonedStartOfDay,
  zonedYmd,
} from "./dateTime";

/** Periods, day keys and date inputs all follow the viewer's profile zone. */
export type DashboardPeriodId = "today" | "7d" | "1m" | "mtd" | "3m";

export const DASHBOARD_PERIOD_OPTIONS: {
  id: DashboardPeriodId;
  label: string;
}[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7d" },
  { id: "mtd", label: "MTD" },
  { id: "3m", label: "3m" },
];

export function startOfDay(d: Date): Date {
  return zonedStartOfDay(zonedYmd(d));
}

export function endOfDay(d: Date): Date {
  return zonedEndOfDay(zonedYmd(d));
}

export function toDateInputValue(d: Date): string {
  return zonedYmd(d);
}

export function parseDateInput(value: string, end = false): Date {
  return end ? zonedEndOfDay(value) : zonedStartOfDay(value);
}

export function periodWindow(id: DashboardPeriodId): { from: Date; to: Date } {
  const today = zonedYmd();
  const to = zonedEndOfDay(today);
  if (id === "today") return { from: zonedStartOfDay(today), to };
  if (id === "mtd") return { from: zonedStartOfDay(`${today.slice(0, 8)}01`), to };
  if (id === "3m") return { from: zonedStartOfDay(addMonthsYmd(today, -3)), to };
  const days = id === "7d" ? 6 : 29;
  return { from: zonedStartOfDay(addDaysYmd(today, -days)), to };
}

export function buildDayKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const end = zonedYmd(to);
  for (let cur = zonedYmd(from); cur <= end && keys.length < 1000; cur = addDaysYmd(cur, 1)) {
    keys.push(cur);
  }
  return keys.length ? keys : [zonedYmd(from)];
}

export function dayKeyFromIso(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return zonedYmd(new Date(t));
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
