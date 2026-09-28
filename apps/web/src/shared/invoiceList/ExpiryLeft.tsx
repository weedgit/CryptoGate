import { getUserTimezone } from "../userTimezone";

function formatTimeLeft(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m left`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} left`;
}

/** Exact expiry in the user's profile zone (browser zone if unset), zone named. */
function formatExpiryMoment(epochMs: number): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  };
  const tz = getUserTimezone();
  try {
    return new Date(epochMs).toLocaleString(undefined, tz ? { ...opts, timeZone: tz } : opts);
  } catch {
    return new Date(epochMs).toLocaleString(undefined, opts);
  }
}

export function ExpiryLeft({ expiresAt, nowMs }: { expiresAt: string; nowMs: number }) {
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return null;
  const ms = end - nowMs;
  const tone = ms <= 0 ? " is-expired" : ms < 5 * 60_000 ? " is-soon" : "";
  return (
    <span className={`invoice-list__expiry${tone}`} title={`Expires ${formatExpiryMoment(end)}`}>
      {ms <= 0 ? "Expiring…" : formatTimeLeft(ms)}
    </span>
  );
}
