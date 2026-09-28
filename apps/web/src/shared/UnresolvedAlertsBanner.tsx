import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AlertItem, AlertsSource } from "../platform/ui/AlertsDrawer";
import {
  DOCK_COLLAPSE_AFTER_LEAVE_MS,
  DOCK_COLLAPSE_AFTER_MS,
  DOCK_EXIT_MS,
  dockSnapshot,
  shouldReexpand,
  type DockSnapshot,
} from "./alertDockModel";

type Props = {
  source: AlertsSource;
  onOpenAlerts: () => void;
};

export function unresolvedAlerts(items: AlertItem[]): AlertItem[] {
  return items.filter((a) => a.unresolved !== false);
}

function bannerTone(
  items: AlertItem[],
): "anomaly" | "warn" | "info" {
  if (items.some((a) => a.tone === "anomaly")) return "anomaly";
  if (items.some((a) => a.tone === "warn" || a.urgent)) return "warn";
  return "info";
}

function bannerMessage(items: AlertItem[]): string {
  const n = items.length;
  const actionable = items.filter(
    (a) => a.actionable !== false && !a.waiting,
  ).length;
  if (actionable > 0) {
    return n === 1
      ? "1 alert needs your attention"
      : `${n} alerts need your attention`;
  }
  const escalate = items.filter((a) => !a.waiting).length;
  if (escalate > 0) {
    return escalate === 1
      ? "Owner or Admin must clear 1 alert"
      : `Owner or Admin must clear ${escalate} alerts`;
  }
  return n === 1 ? "1 alert waiting to clear" : `${n} alerts waiting to clear`;
}

function bannerLabel(items: AlertItem[]): string {
  return items.every((a) => a.waiting) ? "In progress" : "Action required";
}

/**
 * Floating bottom-right glass dock while any unresolved alert exists.
 * Marking read does not hide this — only clearing the underlying condition does.
 * Collapses to the bell + badge after a few seconds; hover / focus expands it,
 * and a new or more severe alert slides it back open.
 */
export function UnresolvedAlertsBanner({ source, onOpenAlerts }: Props) {
  const [items, setItems] = useState<AlertItem[]>(() => source.list());

  useEffect(() => source.subscribe(setItems), [source]);

  const open = useMemo(() => unresolvedAlerts(items), [items]);
  const hasAlerts = open.length > 0;

  /** Last non-empty list, kept briefly so the dock can fade out when everything clears. */
  const [display, setDisplay] = useState<AlertItem[]>(open);
  useEffect(() => {
    if (open.length > 0) {
      setDisplay(open);
      return;
    }
    const t = window.setTimeout(() => setDisplay([]), DOCK_EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  const [expanded, setExpanded] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [cycle, setCycle] = useState(0);
  const collapseDelay = useRef(DOCK_COLLAPSE_AFTER_MS);
  const prevSnap = useRef<DockSnapshot | null>(null);

  useEffect(() => {
    if (open.length === 0) {
      prevSnap.current = null;
      return;
    }
    const snap = dockSnapshot(
      open.map((a) => a.id),
      bannerTone(open),
    );
    const reexpand = shouldReexpand(prevSnap.current, snap);
    prevSnap.current = snap;
    if (reexpand) {
      collapseDelay.current = DOCK_COLLAPSE_AFTER_MS;
      setExpanded(true);
      setCycle((c) => c + 1);
    }
  }, [open]);

  useEffect(() => {
    if (!hasAlerts || !expanded || pinned) return;
    const t = window.setTimeout(() => setExpanded(false), collapseDelay.current);
    return () => window.clearTimeout(t);
  }, [hasAlerts, expanded, pinned, cycle]);

  const pin = useCallback(() => {
    setPinned(true);
    setExpanded(true);
  }, []);
  const release = useCallback(() => {
    collapseDelay.current = DOCK_COLLAPSE_AFTER_LEAVE_MS;
    setPinned(false);
  }, []);

  if (display.length === 0) return null;

  const leaving = !hasAlerts;
  const shown = hasAlerts ? open : display;
  const tone = bannerTone(shown);
  const count = shown.length;
  const collapsed = !expanded && !leaving;
  const countLabel = count > 99 ? "99+" : String(count);

  return createPortal(
    <div className="unresolved-alerts-dock" role="status" aria-live="polite">
      <div
        className={`unresolved-alerts-dock__card unresolved-alerts-dock__card--${tone}${
          collapsed ? " is-collapsed" : ""
        }${leaving ? " is-leaving" : ""}`}
        onMouseEnter={pin}
        onMouseLeave={release}
        onFocus={pin}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) release();
        }}
      >
        <span className="unresolved-alerts-dock__glow" aria-hidden />
        <span className="unresolved-alerts-dock__sheen" aria-hidden />
        <button
          type="button"
          className="unresolved-alerts-dock__mark"
          onClick={onOpenAlerts}
          aria-label={`${count} unresolved alert${count === 1 ? "" : "s"} — open alerts`}
          tabIndex={collapsed ? 0 : -1}
        >
          <span className="unresolved-alerts-dock__ring" aria-hidden />
          <span className="unresolved-alerts-dock__bell" aria-hidden />
          <span className="unresolved-alerts-dock__badge" key={count} aria-hidden>
            {countLabel}
          </span>
        </button>
        <div className="unresolved-alerts-dock__copy" aria-hidden={collapsed || undefined}>
          <p className="unresolved-alerts-dock__label">{bannerLabel(shown)}</p>
          <p className="unresolved-alerts-dock__text">{bannerMessage(shown)}</p>
        </div>
        <button
          type="button"
          className="unresolved-alerts-dock__action"
          onClick={onOpenAlerts}
          tabIndex={collapsed ? -1 : 0}
        >
          Review
        </button>
      </div>
    </div>,
    document.body,
  );
}
