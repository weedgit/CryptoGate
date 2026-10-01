/**
 * Dashboard period parsing, chart interval choice and bucket keys.
 * Periods are local calendar dates (YYYY-MM-DD) in the viewer's IANA time zone.
 */

export const DASHBOARD_MAX_RANGE_DAYS = 366;

/** Single day → hourly; up to ~2 months → daily; longer → weekly (≤ ~53 points). */
export const DAILY_MAX_DAYS = 62;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * @param {string} tz
 * @returns {boolean}
 */
export function isValidTimeZone(tz) {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  if (!/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} value
 * @returns {number | null} UTC ms at 00:00 of that calendar date
 */
function dateMs(value) {
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(ms);
  if (
    d.getUTCFullYear() !== Number(m[1]) ||
    d.getUTCMonth() !== Number(m[2]) - 1 ||
    d.getUTCDate() !== Number(m[3])
  ) {
    return null;
  }
  return ms;
}

/**
 * @param {number} ms
 */
function msToDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

/**
 * @param {string} date
 * @param {number} days
 */
export function addDays(date, days) {
  const ms = dateMs(date);
  if (ms == null) throw new Error(`invalid date ${date}`);
  return msToDate(ms + days * DAY_MS);
}

/**
 * Inclusive day count between two calendar dates.
 * @param {string} from
 * @param {string} to
 */
export function daySpan(from, to) {
  const a = dateMs(from);
  const b = dateMs(to);
  if (a == null || b == null) return 0;
  return Math.round((b - a) / DAY_MS) + 1;
}

/**
 * @param {number} days
 * @returns {"hour" | "day" | "week"}
 */
export function pickInterval(days) {
  if (days <= 1) return "hour";
  if (days <= DAILY_MAX_DAYS) return "day";
  return "week";
}

/**
 * Local date + hour "now" in a time zone.
 * @param {string} tz
 * @param {Date} [now]
 * @returns {{ date: string, hour: number }}
 */
export function localNow(tz, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
  };
}

/**
 * @typedef {{
 *   from: string,
 *   to: string,
 *   tz: string,
 *   days: number,
 *   interval: "hour" | "day" | "week",
 *   hourStep?: number,
 *   prevFrom: string,
 *   prevTo: string,
 * }} DashboardRange
 */

/**
 * @param {URLSearchParams} params
 * @returns {{ ok: true, range: DashboardRange } | { ok: false, status: number, code: string, message: string }}
 */
export function parseDashboardRange(params) {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const tzRaw = params.get("tz");
  const tz = tzRaw && tzRaw.trim() ? tzRaw.trim() : "UTC";

  if (dateMs(from) == null || dateMs(to) == null) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "from and to are required calendar dates (YYYY-MM-DD)",
    };
  }
  if (from > to) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "from must be on or before to",
    };
  }
  const days = daySpan(from, to);
  if (days > DASHBOARD_MAX_RANGE_DAYS) {
    return {
      ok: false,
      status: 400,
      code: "range_too_long",
      message: `Date range is limited to ${DASHBOARD_MAX_RANGE_DAYS} days`,
    };
  }
  if (!isValidTimeZone(tz)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "tz must be an IANA time zone (e.g. America/Los_Angeles)",
    };
  }
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return {
    ok: true,
    range: { from, to, tz, days, interval: pickInterval(days), prevFrom, prevTo },
  };
}

/**
 * Ordered bucket keys for a range. Hourly keys stop at the current hour for today
 * (no empty future hours); `hourStep` groups hours into blocks keyed by their first hour.
 * @param {DashboardRange} range
 * @param {Date} [now]
 * @returns {string[]}
 */
export function bucketKeys(range, now = new Date()) {
  if (range.interval === "hour") {
    const local = localNow(range.tz, now);
    const step = range.hourStep ?? 1;
    const keys = [];
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
      if (d > local.date && d !== range.from) break;
      let lastHour = 23;
      if (d === local.date) lastHour = local.hour;
      else if (d > local.date) lastHour = 0;
      for (let h = 0; h <= lastHour; h += step) {
        keys.push(`${d}T${String(h).padStart(2, "0")}`);
      }
    }
    return keys;
  }
  const step = range.interval === "week" ? 7 : 1;
  const keys = [];
  for (let d = range.from; d <= range.to; d = addDays(d, step)) {
    keys.push(d);
  }
  return keys;
}

/**
 * SQL expression → bucket key text matching `bucketKeys`.
 * @param {"hour" | "day" | "week"} interval
 * @param {string} tsExpr timestamptz column expression
 * @param {number} tzIdx param index holding the IANA tz
 * @param {number} fromIdx param index holding the range start date
 * @param {number} [hourStep] hours per bucket when interval is "hour"
 */
export function bucketKeySql(interval, tsExpr, tzIdx, fromIdx, hourStep = 1) {
  const local = `(${tsExpr} AT TIME ZONE $${tzIdx})`;
  if (interval === "hour" && hourStep > 1) {
    const step = Math.trunc(hourStep);
    return `to_char(date_trunc('day', ${local}) + (floor(extract(hour from ${local}) / ${step}) * ${step}) * interval '1 hour', 'YYYY-MM-DD"T"HH24')`;
  }
  if (interval === "hour") {
    return `to_char(date_trunc('hour', ${local}), 'YYYY-MM-DD"T"HH24')`;
  }
  if (interval === "day") {
    return `to_char(${local}::date, 'YYYY-MM-DD')`;
  }
  return `to_char($${fromIdx}::date + (((${local}::date - $${fromIdx}::date) / 7) * 7), 'YYYY-MM-DD')`;
}

/**
 * SQL numeric from a TEXT amount column; non-numeric text counts as 0.
 * @param {string} expr
 */
export function safeNumericSql(expr) {
  return `(CASE WHEN ${expr} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${expr})::numeric ELSE 0 END)`;
}

/**
 * YYYY-MM keys for calendar months touched by [from, to].
 * @param {string} from
 * @param {string} to
 */
export function monthKeysForRange(from, to) {
  const keys = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

/**
 * Align sparse SQL rows to bucket keys (missing buckets → 0).
 * @param {string[]} keys
 * @param {Map<string, number>} values
 */
export function fillSeries(keys, values) {
  return keys.map((k) => {
    const n = values.get(k);
    return Number.isFinite(n) ? Math.round(n * 1e8) / 1e8 : 0;
  });
}

/**
 * Percent change current vs previous (null when there's no baseline or no data).
 * @param {number} current
 * @param {number} previous
 */
export function percentChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * Optional local-date window without a length cap (grouped reports, list filters).
 * Both from and to absent → all time.
 * @param {URLSearchParams} sp
 * @returns {{ ok: true, window: { from: string, to: string, tz: string } | null } | { ok: false, message: string }}
 */
export function parseOptionalDateWindow(sp) {
  const from = sp.get("from")?.trim() || "";
  const to = sp.get("to")?.trim() || "";
  const tz = sp.get("tz")?.trim() || "UTC";
  if (!from && !to) return { ok: true, window: null };
  if (dateMs(from) == null || dateMs(to) == null) {
    return { ok: false, message: "from and to must be YYYY-MM-DD" };
  }
  if (from > to) return { ok: false, message: "from must be on or before to" };
  if (!isValidTimeZone(tz)) return { ok: false, message: "Invalid tz" };
  return { ok: true, window: { from, to, tz } };
}
