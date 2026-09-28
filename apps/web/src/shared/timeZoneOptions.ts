import { zoneAbbrev, zoneOffsetMinutes } from "./dateTime";

const FALLBACK_ZONES = [
  "UTC",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Bangkok",
  "Asia/Ho_Chi_Minh",
  "Asia/Jakarta",
  "Asia/Manila",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
];

let cached: string[] | null = null;

/** Every IANA zone the browser knows (UTC first), falling back to a short list. */
export function allTimeZones(): string[] {
  if (cached) return cached;
  let zones: string[] = [];
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    zones = intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  cached = [...new Set(["UTC", ...(zones.length ? zones : FALLBACK_ZONES)])];
  return cached;
}

function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${h}:${m}`;
}

/** "Asia/Seoul (UTC+09:00)" style label for pickers. */
export function timeZoneOptionLabel(tz: string): string {
  if (tz === "UTC") return "UTC";
  try {
    return `${tz.replaceAll("_", " ")} (${offsetLabel(zoneOffsetMinutes(tz))})`;
  } catch {
    return tz;
  }
}

/** Picker options, always including `current` even when it is unusual. */
export function timeZoneSelectOptions(current?: string | null): { id: string; label: string }[] {
  const zones = allTimeZones();
  const list = current && !zones.includes(current) ? [current, ...zones] : zones;
  return list.map((id) => ({ id, label: timeZoneOptionLabel(id) }));
}

/** "Asia/Seoul · GMT+9" for compact display. */
export function timeZoneShortLabel(tz: string): string {
  const abbr = zoneAbbrev(tz);
  return abbr === tz ? tz.replaceAll("_", " ") : `${tz.replaceAll("_", " ")} · ${abbr}`;
}
