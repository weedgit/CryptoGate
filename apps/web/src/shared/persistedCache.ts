import { getPortal, type PortalId } from "./portalRouting";

export type PersistedEntry<T> = {
  portal: PortalId;
  savedAt: number;
  data: T;
};

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
    const payload: PersistedEntry<T> = {
      portal,
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
