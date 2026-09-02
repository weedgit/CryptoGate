import { getPortal, type PortalId } from "./portalRouting";
import { readCachedSession } from "../auth/sessionCache";

export type PersistedEntry<T> = {
  portal: PortalId;
  userId?: string;
  savedAt: number;
  data: T;
};

function currentCacheUserId(): string | null {
  return readCachedSession()?.userId ?? null;
}

export function readPersistedCache<T>(
  key: string,
  maxAgeMs: number,
  portal: PortalId = getPortal(),
): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedEntry<T>;
    if (parsed.portal !== portal || parsed.savedAt == null) return null;
    const userId = currentCacheUserId();
    if (userId) {
      if (!parsed.userId || parsed.userId !== userId) return null;
    }
    if (Date.now() - parsed.savedAt > maxAgeMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writePersistedCache<T>(
  key: string,
  data: T,
  portal: PortalId = getPortal(),
): void {
  try {
    const userId = currentCacheUserId();
    const payload: PersistedEntry<T> = {
      portal,
      userId: userId ?? undefined,
      savedAt: Date.now(),
      data,
    };
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* sessionStorage unavailable */
  }
}

export function clearPersistedCache(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* sessionStorage unavailable */
  }
}
