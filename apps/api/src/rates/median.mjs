/**
 * Decimal-string median for FX rates (no IEEE float for the locked rate).
 */

/**
 * @param {string} s
 * @param {number} scale
 * @returns {bigint}
 */
export function parseDecimalToScaled(s, scale) {
  const t = String(s ?? "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) {
    throw Object.assign(new Error("invalid_decimal"), { code: "invalid_request" });
  }
  const neg = t.startsWith("-");
  const [whole, frac = ""] = (neg ? t.slice(1) : t).split(".");
  const fracPadded = (frac + "0".repeat(scale)).slice(0, scale);
  const n = BigInt(whole || "0") * 10n ** BigInt(scale) + BigInt(fracPadded || "0");
  return neg ? -n : n;
}

/**
 * @param {bigint} n
 * @param {number} scale
 * @returns {string}
 */
export function scaledToDecimal(n, scale) {
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const base = 10n ** BigInt(scale);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(scale, "0").replace(/0+$/, "");
  const body = fracStr ? `${whole}.${fracStr}` : `${whole}`;
  return neg ? `-${body}` : body;
}

const WORK = 18;

/**
 * @param {string} n
 * @returns {string}
 */
export function normalizeRate(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) {
    throw new Error(`invalid_rate:${n}`);
  }
  return x.toFixed(12).replace(/\.?0+$/, "") || String(x);
}

/**
 * Median of positive decimal rate strings.
 * Odd count → middle; even → mean of two middle values (floor at WORK scale).
 * @param {string[]} rates
 * @returns {string}
 */
export function medianRate(rates) {
  if (!Array.isArray(rates) || rates.length === 0) {
    throw Object.assign(new Error("median_empty"), { code: "rates_unavailable" });
  }
  const scaled = rates.map((r) => parseDecimalToScaled(r, WORK));
  scaled.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(scaled.length / 2);
  if (scaled.length % 2 === 1) {
    return scaledToDecimal(scaled[mid], WORK);
  }
  const avg = (scaled[mid - 1] + scaled[mid]) / 2n;
  return scaledToDecimal(avg, WORK);
}

/**
 * Absolute deviation of `rate` from `ref` in basis points (floor).
 * @param {string} rate
 * @param {string} ref
 * @returns {number}
 */
export function deviationBps(rate, ref) {
  const r = parseDecimalToScaled(rate, WORK);
  const f = parseDecimalToScaled(ref, WORK);
  if (f === 0n) throw new Error("ref_zero");
  const diff = r > f ? r - f : f - r;
  // bps = diff / ref * 10000
  return Number((diff * 10_000n) / f);
}
