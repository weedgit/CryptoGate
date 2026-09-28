export type DockTone = "anomaly" | "warn" | "info";

/** Collapse this long after the dock appears or re-expands for a change. */
export const DOCK_COLLAPSE_AFTER_MS = 6000;
/** Collapse this long after the pointer leaves / focus moves out. */
export const DOCK_COLLAPSE_AFTER_LEAVE_MS = 1000;
/** Fade-out length once every alert clears. */
export const DOCK_EXIT_MS = 280;

const TONE_RANK: Record<DockTone, number> = { info: 0, warn: 1, anomaly: 2 };

export type DockSnapshot = { ids: ReadonlySet<string>; tone: DockTone };

export function dockSnapshot(ids: readonly string[], tone: DockTone): DockSnapshot {
  return { ids: new Set(ids), tone };
}

/** Slide back open when a new alert arrives or severity rises — not on every poll. */
export function shouldReexpand(prev: DockSnapshot | null, next: DockSnapshot): boolean {
  if (!prev) return true;
  if (TONE_RANK[next.tone] > TONE_RANK[prev.tone]) return true;
  for (const id of next.ids) if (!prev.ids.has(id)) return true;
  return false;
}
