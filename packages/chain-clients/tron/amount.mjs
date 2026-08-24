/**
 * Major-unit decimal strings for matching (no float).
 */

/**
 * @param {string | number | bigint} minor
 * @param {number} decimals
 * @returns {string}
 */
export function minorToMajor(minor, decimals) {
  const raw = String(minor).trim();
  if (!/^\d+$/.test(raw)) {
    throw new Error(`invalid minor amount: ${minor}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error(`invalid decimals: ${decimals}`);
  }
  if (decimals === 0) return raw.replace(/^0+(?=\d)/, "") || "0";

  const padded = raw.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals).replace(/^0+(?=\d)/, "") || "0";
  const frac = padded.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
