import { formatInZone, formatViewerDateTime } from "./dateTime";

/** "5 minutes ago" style, falling back to a date after two weeks. */
export function formatRelativeTime(iso: string | null | undefined, empty = "Never"): string {
  if (!iso) return empty;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return formatViewerDateTime(iso);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatInZone(d, { year: "numeric", month: "numeric", day: "numeric" });
}
