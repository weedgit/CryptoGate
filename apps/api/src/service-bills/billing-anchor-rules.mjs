/**
 * Payment-date billing helpers (UTC).
 */

/**
 * Add one calendar month in UTC, clamping day-of-month (31 Jan → 28/29 Feb).
 * @param {Date | string} from
 * @returns {Date}
 */
export function addOneMonthUtc(from) {
  const d = from instanceof Date ? new Date(from.getTime()) : new Date(from);
  if (Number.isNaN(d.getTime())) throw new Error("invalid date");
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m + 1, 1));
  const dim = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, dim));
  target.setUTCHours(
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  );
  return target;
}

/**
 * @param {Date | string} from
 * @returns {string} YYYY-MM-DD
 */
export function addOneMonthUtcDateString(from) {
  return addOneMonthUtc(from).toISOString().slice(0, 10);
}

/**
 * UTC calendar date YYYY-MM-DD.
 * @param {Date} [now]
 */
export function utcToday(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Normalize a Postgres DATE / timestamptz / string to YYYY-MM-DD (UTC).
 * @param {unknown} value
 * @returns {string | null}
 */
export function toUtcDateString(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Volume / invoice display window for a recurring cycle ending on invoiceOn (exclusive).
 * @param {string} periodStartYmd
 * @param {string} invoiceOnYmd
 */
export function recurringVolumeWindow(periodStartYmd, invoiceOnYmd) {
  const inclusiveStartIso = `${periodStartYmd}T00:00:00.000Z`;
  const exclusiveEndIso = `${invoiceOnYmd}T00:00:00.000Z`;
  const periodEndDate = new Date(`${invoiceOnYmd}T00:00:00.000Z`);
  periodEndDate.setUTCDate(periodEndDate.getUTCDate() - 1);
  const periodEndYmd = periodEndDate.toISOString().slice(0, 10);
  const displayPeriodEnd =
    periodEndYmd < periodStartYmd ? periodStartYmd : periodEndYmd;
  return { inclusiveStartIso, exclusiveEndIso, displayPeriodEnd };
}

/**
 * End of UTC day for due_at.
 * @param {string} ymd
 * @param {number} payDays
 */
export function dueAtFromSendPlusDays(ymd, payDays, from = new Date()) {
  const base =
    ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd)
      ? new Date(`${ymd}T00:00:00.000Z`)
      : new Date(from.getTime());
  base.setUTCDate(base.getUTCDate() + Math.max(1, Number(payDays) || 7));
  base.setUTCHours(23, 59, 59, 999);
  return base.toISOString();
}

/**
 * Ms until next 00:00:00.000 UTC (or 0 if already within first minute of the day — caller may still run).
 * @param {Date} [now]
 */
export function msUntilNextUtcMidnight(now = new Date()) {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.max(0, next - now.getTime());
}
