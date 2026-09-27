import { useEffect, useRef } from "react";
import type { Session } from "../merchant/api";
import { clearPlatformAlert, upsertPlatformAlert } from "../platform/platformAlerts";
import type { AlertItem } from "../platform/ui/AlertsDrawer";

const REFRESH_MS = 60_000;

/**
 * Replaces one group of condition alerts in the shared platform/agent store:
 * upserts the current set and clears ids from the previous run that are gone.
 */
export function createConditionAlertGroup(): (items: AlertItem[]) => void {
  let previous = new Set<string>();
  return (items) => {
    const next = new Set(items.map((a) => a.id));
    for (const id of previous) {
      if (!next.has(id)) clearPlatformAlert(id);
    }
    for (const item of items) upsertPlatformAlert(item);
    previous = next;
  };
}

/**
 * Keeps a condition-alert group fresh while a shell is mounted: on mount,
 * every minute, when the drawer opens, and when setup state changes.
 */
export function useConditionAlerts(
  session: Session,
  refresh: (session: Session) => Promise<void>,
  clear: () => void,
  alertsOpen: boolean,
): void {
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const setupKey = `${session.userId}:${session.setupReady}:${session.contactVerified}:${session.walletSet}:${session.personComplete}:${session.profileComplete}`;

  useEffect(() => {
    void refresh(sessionRef.current);
    const id = window.setInterval(() => void refresh(sessionRef.current), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh, setupKey]);

  useEffect(() => {
    if (alertsOpen) void refresh(sessionRef.current);
  }, [alertsOpen, refresh]);

  useEffect(() => clear, [clear]);
}
