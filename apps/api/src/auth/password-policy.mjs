/**
 * Password policy constants (M1-10).
 * OpenAPI LoginRequest.password minLength is 12; keep in sync.
 */

export const DEFAULT_PASSWORD_MIN_LENGTH = 12;

/**
 * @returns {number}
 */
export function getPasswordMinLength() {
  const raw = process.env.PASSWORD_MIN_LENGTH;
  if (raw === undefined || raw === "") return DEFAULT_PASSWORD_MIN_LENGTH;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PASSWORD_MIN_LENGTH;
  return n;
}

/**
 * @param {string} password
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function validatePassword(password) {
  if (typeof password !== "string") {
    return {
      ok: false,
      code: "password_invalid",
      message: "Password is required",
    };
  }
  const min = getPasswordMinLength();
  if (password.length < min) {
    return {
      ok: false,
      code: "password_too_short",
      message: `Password must be at least ${min} characters`,
    };
  }
  return { ok: true };
}

/**
 * Stricter policy for password reset (A3 UI checklist).
 * @param {string} password
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function validatePasswordReset(password) {
  const base = validatePassword(password);
  if (!base.ok) {
    return base;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return {
      ok: false,
      code: "password_needs_mixed_case",
      message: "Password must include upper and lower case letters",
    };
  }
  if (!/\d/.test(password)) {
    return {
      ok: false,
      code: "password_needs_number",
      message: "Password must include a number",
    };
  }
  return { ok: true };
}
