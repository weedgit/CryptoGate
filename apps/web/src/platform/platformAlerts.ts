import type { AlertItem } from "./ui/AlertsDrawer";

type Listener = (items: AlertItem[]) => void;

const LIVE_ALERTS: AlertItem[] = [];
const listeners = new Set<Listener>();

function emit() {
  const snapshot = [...LIVE_ALERTS];
  for (const fn of listeners) fn(snapshot);
}

/** Subscribe to live platform alerts (network / chain / system). */
export function subscribePlatformAlerts(listener: Listener): () => void {
  listeners.add(listener);
  listener([...LIVE_ALERTS]);
  return () => listeners.delete(listener);
}

export function listLivePlatformAlerts(): AlertItem[] {
  return [...LIVE_ALERTS];
}

/**
 * Upsert a live alert by id (keeps drawer from flooding duplicates).
 */
export function upsertPlatformAlert(alert: AlertItem): void {
  const i = LIVE_ALERTS.findIndex((a) => a.id === alert.id);
  if (i >= 0) {
    LIVE_ALERTS[i] = { ...LIVE_ALERTS[i], ...alert, unread: true };
  } else {
    LIVE_ALERTS.unshift(alert);
  }
  emit();
}

export function clearPlatformAlert(id: string): void {
  const next = LIVE_ALERTS.filter((a) => a.id !== id);
  if (next.length === LIVE_ALERTS.length) return;
  LIVE_ALERTS.length = 0;
  LIVE_ALERTS.push(...next);
  emit();
}

export function relativeAlertTime(): string {
  return "Just now";
}
