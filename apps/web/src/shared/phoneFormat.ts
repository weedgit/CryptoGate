/** Two-digit calling codes. Everything else is 1 digit (1, 7) or 3 digits. */
const TWO_DIGIT_CALLING_CODES = new Set([
  20, 27, 30, 31, 32, 33, 34, 36, 39, 40, 41, 43, 44, 45, 46, 47, 48, 49,
  51, 52, 53, 54, 55, 56, 57, 58, 60, 61, 62, 63, 64, 65, 66,
  81, 82, 84, 86, 90, 91, 92, 93, 94, 95, 98,
]);

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function callingCodeLength(digits: string): number {
  if (digits.startsWith("1") || digits.startsWith("7")) return 1;
  if (digits.length >= 2 && TWO_DIGIT_CALLING_CODES.has(Number(digits.slice(0, 2)))) {
    return 2;
  }
  if (digits.length >= 3) return 3;
  return digits.length;
}

function formatNanp(national: string): string {
  const n = national.slice(0, 10);
  const area = n.slice(0, 3);
  const prefix = n.slice(3, 6);
  const line = n.slice(6, 10);
  let out = "+1";
  if (!area) return out;
  if (area.length < 3) return `${out} (${area}`;
  out += ` (${area})`;
  if (!prefix) return out;
  out += ` ${prefix}`;
  if (!line) return out;
  return `${out}-${line}`;
}

function formatInternational(digits: string): string {
  const ccLen = callingCodeLength(digits);
  const cc = digits.slice(0, ccLen);
  const national = digits.slice(ccLen);
  let out = `+${cc}`;
  if (!national) return out;
  const area = national.slice(0, 3);
  const rest = national.slice(3);
  if (area.length < 3) return `${out} (${area}`;
  out += ` (${area})`;
  if (!rest) return out;
  const groups: string[] = [];
  for (let i = 0; i < rest.length; i += 3) groups.push(rest.slice(i, i + 3));
  return `${out} ${groups.join(" ")}`;
}

function formatDigits(digits: string): string {
  const capped = digits.slice(0, 15);
  if (!capped) return "";
  if (capped.startsWith("1")) return formatNanp(capped.slice(1));
  return formatInternational(capped);
}

/** Readable phone for display. Empty input stays empty. */
export function formatPhoneDisplay(value: string | null | undefined): string {
  const digits = digitsOnly(value ?? "");
  if (!digits) return "";
  return formatDigits(digits);
}

/**
 * As-you-type formatter. Deleting a parenthesis, space, or hyphen
 * removes the previous digit so the mask can be edited.
 */
export function formatPhoneInput(nextRaw: string, prevFormatted = ""): string {
  let digits = digitsOnly(nextRaw);
  const prevDigits = digitsOnly(prevFormatted);
  if (
    nextRaw.length < prevFormatted.length &&
    digits === prevDigits &&
    digits.length > 0
  ) {
    digits = digits.slice(0, -1);
  }
  if (!digits) return "";
  return formatDigits(digits);
}
