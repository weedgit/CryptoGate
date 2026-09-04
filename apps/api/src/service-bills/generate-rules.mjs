const AMOUNT_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

/**
 * Previous calendar month (UTC).
 * @param {Date} [now]
 */
export function previousCalendarMonthUtc(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1, 1));
  const exclusiveEnd = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(exclusiveEnd.getTime() - 86_400_000);
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: lastDay.toISOString().slice(0, 10),
    inclusiveStartIso: start.toISOString(),
    exclusiveEndIso: exclusiveEnd.toISOString(),
  };
}

/**
 * @param {string} periodEnd YYYY-MM-DD
 */
export function defaultDueAt(periodEnd) {
  const d = new Date(`${periodEnd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 14);
  return d.toISOString();
}

/**
 * Round a non-negative decimal string to 2 USD places (half up).
 * @param {string} raw
 */
export function roundUsd(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s.startsWith("-")) return "0.00";
  const [wholeRaw, fracRaw = ""] = s.split(".");
  if (!/^\d+$/.test(wholeRaw || "0")) return "0.00";
  const whole = wholeRaw || "0";
  const frac = `${fracRaw}000`;
  let cents = BigInt(whole) * 100n + BigInt(frac.slice(0, 2));
  if (frac[2] >= "5") cents += 1n;
  const w = cents / 100n;
  const f = (cents % 100n).toString().padStart(2, "0");
  return `${w}.${f}`;
}

/**
 * Volume fee = rounded volume × percent / 100, 2 dp USD, no float.
 * @param {string} volumeUsd
 * @param {string} percent e.g. "1.20"
 */
export function volumeFeeUsd(volumeUsd, percent) {
  const vol = roundUsd(volumeUsd);
  const pct = String(percent ?? "").trim();
  if (!AMOUNT_RE.test(vol) || !/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(pct)) {
    return "0.00";
  }
  const [pw, pf = ""] = pct.split(".");
  const bps = BigInt(pw) * 10000n + BigInt((pf + "0000").slice(0, 4));
  // bps is percent × 10000 (1.20% → 12000). feeCents = volCents * bps / 1_000_000
  const [vw, vf = ""] = vol.split(".");
  const volCents = BigInt(vw) * 100n + BigInt((vf + "00").slice(0, 2));
  const feeCents = (volCents * bps) / 1_000_000n;
  const w = feeCents / 100n;
  const f = (feeCents % 100n).toString().padStart(2, "0");
  return `${w}.${f}`;
}

/**
 * True when the merchant existed on or before the billing period end (UTC date).
 * Merchants onboarded after periodEnd are not billable for that period.
 * @param {Date | string | null | undefined} createdAt
 * @param {string} periodEnd YYYY-MM-DD
 */
export function merchantOnboardedInPeriod(createdAt, periodEnd) {
  if (!periodEnd || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return true;
  if (!createdAt) return true;
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return true;
  const periodEndMs = Date.parse(`${periodEnd}T23:59:59.999Z`);
  return created.getTime() <= periodEndMs;
}

/**
 * @param {unknown} body
 * @param {Date} [now]
 */
export function resolveGeneratePeriod(body, now = new Date()) {
  const prev = previousCalendarMonthUtc(now);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: true, ...prev };
  }
  const periodStart =
    typeof body.periodStart === "string" ? body.periodStart.trim() : "";
  const periodEnd =
    typeof body.periodEnd === "string" ? body.periodEnd.trim() : "";
  if (!periodStart && !periodEnd) {
    return { ok: true, ...prev };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "periodStart and periodEnd must be YYYY-MM-DD",
    };
  }
  if (periodEnd < periodStart) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "periodEnd must be on or after periodStart",
    };
  }
  const start = new Date(`${periodStart}T00:00:00.000Z`);
  const exclusiveEnd = new Date(`${periodEnd}T00:00:00.000Z`);
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
  return {
    ok: true,
    periodStart,
    periodEnd,
    inclusiveStartIso: start.toISOString(),
    exclusiveEndIso: exclusiveEnd.toISOString(),
  };
}
