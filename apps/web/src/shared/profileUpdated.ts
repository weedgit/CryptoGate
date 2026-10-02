import { useEffect, useState } from "react";

export const PROFILE_UPDATED_EVENT = "cg:profile-updated";

type ProfileFields = {
  userId?: string;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  timezone?: string;
  businessTimezone?: string | null;
  avatarUrl?: string | null;
};

/** Signed-in user's own fields that other pages (owner/team cards) display. */
export function profileSignature(s: ProfileFields | null | undefined): string {
  if (!s) return "";
  return JSON.stringify([
    s.userId,
    s.email,
    s.firstName ?? null,
    s.lastName ?? null,
    s.phone ?? null,
    s.emailVerified === true,
    s.phoneVerified === true,
    s.businessTimezone ?? s.timezone ?? null,
    s.avatarUrl ?? null,
  ]);
}

export function notifyProfileUpdated(): void {
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}

/** Increments whenever the signed-in user's profile changes; use as an effect dependency to refetch. */
export function useProfileUpdatedTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener(PROFILE_UPDATED_EVENT, bump);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, bump);
  }, []);
  return tick;
}
