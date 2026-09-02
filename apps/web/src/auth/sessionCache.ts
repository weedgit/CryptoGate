import type { Session } from "../merchant/api";
import { getPortal, type PortalId } from "../shared/portalRouting";

const STORAGE_KEY = "paymentgate.portal.session";

type CachedPortalSession = {
  portal: PortalId;
  session: Session;
};

export function readCachedSession(
  portal: PortalId = getPortal(),
): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPortalSession;
    if (parsed.portal !== portal || !parsed.session?.userId) return null;
    return parsed.session;
  } catch {
    return null;
  }
}

export function writeCachedSession(
  session: Session | null,
  portal: PortalId = getPortal(),
): void {
  try {
    if (!session) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    const payload: CachedPortalSession = { portal, session };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* sessionStorage unavailable */
  }
}
