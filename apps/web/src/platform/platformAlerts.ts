import { platformRoute } from "../shared/portalRouting";
import type { AlertItem } from "./ui/AlertsDrawer";

type Listener = (items: AlertItem[]) => void;

const LIVE_ALERTS: AlertItem[] = [];
const listeners = new Set<Listener>();

/**
 * Merchants detail is `/platform/merchants/:id?tab=…`.
 * Older alerts used `?id=` on the list path (no detail pane).
 */
export function normalizePlatformAlertHref(
  href: string | undefined,
): string | undefined {
  if (!href) return href;
  const q = href.indexOf("?");
  const path = q >= 0 ? href.slice(0, q) : href;
  const search = q >= 0 ? href.slice(q + 1) : "";
  if (path !== platformRoute("merchants") || !search) return href;
  const params = new URLSearchParams(search);
  const id = params.get("id");
  if (!id) return href;
  params.delete("id");
  const rest = params.toString();
  return `${platformRoute(`merchants/${encodeURIComponent(id)}`)}${rest ? `?${rest}` : ""}`;
}

function withNormalizedHref(alert: AlertItem): AlertItem {
  const href = normalizePlatformAlertHref(alert.href);
  let next = href === alert.href ? alert : { ...alert, href };
  // Legacy compliance notices were missing unresolved:false and pinned the dock.
  if (
    next.id.startsWith("compliance-override-") &&
    next.unresolved !== false
  ) {
    next = { ...next, unresolved: false };
  }
  return next;
}

function emit() {
  const snapshot = LIVE_ALERTS.map(withNormalizedHref);
  for (const fn of listeners) fn(snapshot);
}

/** Subscribe to live platform alerts (network / chain / system). */
export function subscribePlatformAlerts(listener: Listener): () => void {
  listeners.add(listener);
  listener(LIVE_ALERTS.map(withNormalizedHref));
  return () => listeners.delete(listener);
}

export function listLivePlatformAlerts(): AlertItem[] {
  return LIVE_ALERTS.map(withNormalizedHref);
}

/**
 * Upsert a live alert by id (keeps drawer from flooding duplicates).
 */
export function upsertPlatformAlert(alert: AlertItem): void {
  const next = withNormalizedHref(alert);
  const i = LIVE_ALERTS.findIndex((a) => a.id === next.id);
  if (i >= 0) {
    LIVE_ALERTS[i] = { ...LIVE_ALERTS[i], ...next, unread: true };
  } else {
    LIVE_ALERTS.unshift(next);
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

export function markPlatformAlertRead(id: string): void {
  const i = LIVE_ALERTS.findIndex((a) => a.id === id);
  if (i < 0 || !LIVE_ALERTS[i].unread) return;
  LIVE_ALERTS[i] = { ...LIVE_ALERTS[i], unread: false };
  emit();
}

export function markAllPlatformAlertsRead(): void {
  let changed = false;
  for (let i = 0; i < LIVE_ALERTS.length; i++) {
    if (!LIVE_ALERTS[i].unread) continue;
    LIVE_ALERTS[i] = { ...LIVE_ALERTS[i], unread: false };
    changed = true;
  }
  if (changed) emit();
}

export function countUnreadPlatformAlerts(): number {
  return LIVE_ALERTS.filter((a) => a.unread).length;
}

export function relativeAlertTime(): string {
  return "Just now";
}
