/**
 * Timezone policy:
 * - Viewer-facing timestamps → current user's timezone (profile, else browser).
 * - Platform Owner/Admin schedules & billing calendar days → UTC (labeled in UI).
 * - Date-only billing anchors (YYYY-MM-DD) → UTC calendar day.
 */

let viewerTimeZone: string | null = null;

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Call from portal shells when session loads / changes. */
export function setViewerTimeZone(tz: string | null | undefined): void {
  const next = tz?.trim();
  viewerTimeZone = next || null;
}

export function getViewerTimeZone(): string {
  return viewerTimeZone || browserTimeZone();
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
