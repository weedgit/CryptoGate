/**
 * Timezone policy:
 * - Portal day cuts, lists, dashboards → the org's business zone (UTC when unset).
 * - Customer documents / receipts → order businessTimezone (site → merchant inherit).
 * - Platform Owner/Admin schedules & billing calendar days → UTC (labeled in UI).
 * - Person profiles no longer store a timezone.
 */

let viewerTimeZone: string | null = null;
const listeners = new Set<() => void>();

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz?.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Call when the session loads / changes. Pass the org business timezone
 * (null clears back to UTC for day cuts).
 */
export function setViewerTimeZone(
  tz: string | null | undefined,
  _confirmed = true,
): void {
  const trimmed = tz?.trim();
  const next = isValidTimeZone(trimmed) ? trimmed! : null;
  if (next === viewerTimeZone) return;
  viewerTimeZone = next;
  // Callers may run during render; subscribers re-render afterwards.
  queueMicrotask(() => {
    for (const fn of listeners) fn();
  });
}

export function subscribeViewerTimeZone(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Business zone when set; otherwise UTC (not the browser zone). */
export function getViewerTimeZone(): string {
  return viewerTimeZone || "UTC";
}

export function resolveViewerTimeZone(
  preferred?: string | null,
): string {
  const next = preferred?.trim();
  return next || getViewerTimeZone();
}

function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso?.trim()) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t);
}

/** Full date+time in the viewer's timezone. */
export function formatViewerDateTime(
  iso: string | null | undefined,
  timeZone?: string | null,
): string {
  const d = parseInstant(iso);
  if (!d) return iso?.trim() ? iso : "—";
  try {
    return d.toLocaleString(undefined, {
      timeZone: resolveViewerTimeZone(timeZone),
    });
  } catch {
    return d.toLocaleString();
  }
}

/** Calendar date (MM/DD/YYYY) in the viewer's timezone for instants. */
export function formatViewerDate(
  iso: string | null | undefined,
  timeZone?: string | null,
): string {
  const d = parseInstant(iso);
  if (!d) return iso?.trim() ? iso : "—";
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZone: resolveViewerTimeZone(timeZone),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "";
    return `${get("month")}/${get("day")}/${get("year")}`;
  } catch {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    return `${mm}/${dd}/${yyyy}`;
  }
}

/** UTC calendar day for date-only billing anchors (YYYY-MM-DD). */
export function formatUtcDateOnly(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const raw = iso.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatViewerDate(iso);
  const t = Date.parse(`${raw}T12:00:00.000Z`);
  if (!Number.isFinite(t)) return raw;
  const d = new Date(t);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yyyy = String(d.getUTCFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

/** Short label for platform schedule copy. */
export function utcMidnightLabel(): string {
  return "00:00 UTC";
}

type ZonedParts = { y: number; m: number; d: number; h: number; mi: number; s: number };

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const n = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: n("year"), m: n("month"), d: n("day"), h: n("hour"), mi: n("minute"), s: n("second") };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Calendar day `YYYY-MM-DD` of an instant in a zone (viewer zone by default). */
export function zonedYmd(date: Date = new Date(), timeZone?: string | null): string {
  const p = zonedParts(date, resolveViewerTimeZone(timeZone));
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}

/** UTC offset of a zone in minutes at an instant (e.g. 540 for Asia/Seoul). */
export function zoneOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  return Math.round(zoneOffsetMs(at, timeZone) / 60_000);
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instant for a wall-clock time in a zone (handles DST gaps by shifting forward). */
export function zonedWallTime(
  ymd: string,
  time: { h?: number; mi?: number; s?: number; ms?: number } = {},
  timeZone?: string | null,
): Date {
  const tz = resolveViewerTimeZone(timeZone);
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, (m ?? 1) - 1, d ?? 1, time.h ?? 0, time.mi ?? 0, time.s ?? 0, time.ms ?? 0);
  const first = guess - zoneOffsetMs(new Date(guess), tz);
  const second = guess - zoneOffsetMs(new Date(first), tz);
  return new Date(second);
}

export function zonedStartOfDay(ymd: string, timeZone?: string | null): Date {
  return zonedWallTime(ymd, {}, timeZone);
}

export function zonedEndOfDay(ymd: string, timeZone?: string | null): Date {
  return new Date(zonedStartOfDay(addDaysYmd(ymd, 1), timeZone).getTime() - 1);
}

/** Calendar arithmetic on `YYYY-MM-DD` (zone-free). */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days));
  return t.toISOString().slice(0, 10);
}

/** Same day-of-month `months` later/earlier, clamped to the month's last day. */
export function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const first = new Date(Date.UTC(y, (m ?? 1) - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d ?? 1, last));
  return first.toISOString().slice(0, 10);
}

/** Short zone name at an instant, e.g. "KST", "PDT", "GMT+7"; "UTC" for UTC. */
export function zoneAbbrev(timeZone?: string | null, at: Date = new Date()): string {
  const tz = resolveViewerTimeZone(timeZone);
  if (tz === "UTC" || tz === "Etc/UTC") return "UTC";
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    return part || tz;
  } catch {
    return tz;
  }
}

/**
 * Customer-document timestamp: the merchant's business zone when set, else the viewer's,
 * always with the zone abbreviation so the reader knows which clock it is.
 */
export function formatDocumentDateTime(
  iso: string | Date | null | undefined,
  businessTimeZone?: string | null,
): string {
  return formatInZone(
    iso,
    { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
    isValidTimeZone(businessTimeZone) ? businessTimeZone : undefined,
    true,
  );
}

/** Format an instant in a given zone (defaults to viewer zone); `withZone` appends the abbreviation. */
export function formatInZone(
  iso: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions,
  timeZone?: string | null,
  withZone = false,
): string {
  const d = iso instanceof Date ? iso : parseInstant(iso ?? null);
  if (!d || Number.isNaN(d.getTime())) return "—";
  const tz = resolveViewerTimeZone(timeZone);
  try {
    const text = d.toLocaleString(undefined, { ...opts, timeZone: tz });
    return withZone ? `${text} ${zoneAbbrev(tz, d)}` : text;
  } catch {
    return d.toLocaleString(undefined, opts);
  }
}
