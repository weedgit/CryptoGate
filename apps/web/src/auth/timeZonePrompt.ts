import { isValidTimeZone, zoneOffsetMinutes } from "../shared/dateTime";

export const TZ_MISMATCH_DISMISS_KEY = "cg.tzMismatchDismissed";

export type TimeZonePrompt =
  | { kind: "confirm"; detected: string }
  | { kind: "mismatch"; device: string; profile: string };

/**
 * Unconfirmed profile → ask to confirm the device zone.
 * Confirmed profile on a device with a different UTC offset → one dismissible hint per pair.
 */
export function timeZonePrompt(input: {
  profileTimeZone?: string | null;
  confirmed?: boolean;
  deviceTimeZone: string;
  dismissedPair?: string | null;
  at?: Date;
}): TimeZonePrompt | null {
  const device = isValidTimeZone(input.deviceTimeZone) ? input.deviceTimeZone : "UTC";
  if (input.confirmed !== true) return { kind: "confirm", detected: device };
  const profile = input.profileTimeZone?.trim();
  if (!profile || !isValidTimeZone(profile) || profile === device) return null;
  const at = input.at ?? new Date();
  if (zoneOffsetMinutes(profile, at) === zoneOffsetMinutes(device, at)) return null;
  if (input.dismissedPair === mismatchPairKey(device, profile)) return null;
  return { kind: "mismatch", device, profile };
}

export function mismatchPairKey(device: string, profile: string): string {
  return `${device}|${profile}`;
}
