import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { AlertItem, AlertsSource } from "../platform/ui/AlertsDrawer";

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
  const actionable = items.filter((a) => a.actionable !== false).length;
  if (actionable === 0) {
    return n === 1
      ? "Owner or Admin must clear 1 alert"
      : `Owner or Admin must clear ${n} alerts`;
  }
  return n === 1
    ? "1 alert needs your attention"
    : `${n} alerts need your attention`;
}

/**
 * Floating bottom-right glass dock while any unresolved alert exists.
 * Marking read does not hide this — only clearing the underlying condition does.
 */
export function UnresolvedAlertsBanner({ source, onOpenAlerts }: Props) {
  const [items, setItems] = useState<AlertItem[]>(() => source.list());

  useEffect(() => source.subscribe(setItems), [source]);

  const open = useMemo(() => unresolvedAlerts(items), [items]);
  if (open.length === 0) return null;

  const tone = bannerTone(open);
  const count = open.length;

  return createPortal(
    <div className="unresolved-alerts-dock" role="status" aria-live="polite">
      <div
        className={`unresolved-alerts-dock__card unresolved-alerts-dock__card--${tone}`}
      >
        <span className="unresolved-alerts-dock__glow" aria-hidden />
        <span className="unresolved-alerts-dock__sheen" aria-hidden />
        <div className="unresolved-alerts-dock__mark" aria-hidden>
          <span className="unresolved-alerts-dock__ring" />
          <span className="unresolved-alerts-dock__bell" />
          <span className="unresolved-alerts-dock__badge" key={count}>
            {count > 99 ? "99+" : count}
          </span>
        </div>
        <div className="unresolved-alerts-dock__copy">
          <p className="unresolved-alerts-dock__label">Action required</p>
          <p className="unresolved-alerts-dock__text">{bannerMessage(open)}</p>
        </div>
        <button
          type="button"
          className="unresolved-alerts-dock__action"
          onClick={onOpenAlerts}
        >
          Review
        </button>
      </div>
    </div>,
    document.body,
  );
}
