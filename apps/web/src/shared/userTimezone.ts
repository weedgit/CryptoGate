/** Active user IANA timezone from session profile (A10). */
let userTimezone: string | undefined;

export function setUserTimezone(tz: string | null | undefined): void {
  userTimezone = typeof tz === "string" && tz.trim() ? tz.trim() : undefined;
}

export function getUserTimezone(): string | undefined {
  return userTimezone;
}
