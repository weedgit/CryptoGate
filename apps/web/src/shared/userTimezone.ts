import { getViewerTimeZone } from "./dateTime";

/** Active viewer zone — same source as `shared/dateTime` (profile once confirmed, else browser). */
export function getUserTimezone(): string {
  return getViewerTimeZone();
}
