/** Major/minor unit helpers shared by assign and match. */

/** Major-unit decimal → minor units (integer). Rejects excess fractional digits. */
export function majorToMinor(amount: string, decimals: number): bigint {
  const parts = amount.split(".");
  const wholeRaw = parts[0] ?? "";
  const fracRaw = parts[1] ?? "";
  if (fracRaw.length > decimals) {
    throw new Error(
      `requestedAmount has more than ${decimals} decimal places`,
    );
  }
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  const frac = fracRaw.padEnd(decimals, "0");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac || "0");
}
