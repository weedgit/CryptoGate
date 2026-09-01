import {
  ALLOWED_SESSION_TIMEOUT_MINUTES,
} from "../platform-settings/org-policy-store.mjs";

/** Default sliding TTL for new users and unset preference values. */
export const DEFAULT_USER_SESSION_TIMEOUT_MINUTES = 120;

/**
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeSessionTimeoutMinutes(value) {
  const mins = Number(value);
  if (ALLOWED_SESSION_TIMEOUT_MINUTES.includes(mins)) {
    return mins;
  }
  return DEFAULT_USER_SESSION_TIMEOUT_MINUTES;
}

/**
 * @param {{ sessionTimeoutMinutes?: number } | null | undefined} user
 * @returns {number}
 */
export function ttlMsForUser(user) {
  return normalizeSessionTimeoutMinutes(user?.sessionTimeoutMinutes) * 60 * 1000;
}
