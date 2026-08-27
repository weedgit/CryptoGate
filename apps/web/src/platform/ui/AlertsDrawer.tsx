import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { listLivePlatformAlerts, subscribePlatformAlerts } from "../platformAlerts";

export type AlertCategory = "all" | "payments" | "billing" | "security" | "system";

export type AlertItem = {
  id: string;
  category: Exclude<AlertCategory, "all">;
  title: string;
  body: string;
  at: string;
  href?: string;
  hrefLabel?: string;
  unread?: boolean;
  tone?: "info" | "warn" | "ok" | "anomaly";
};

const FILTERS: { id: AlertCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "payments", label: "Payments" },
  { id: "billing", label: "Billing" },
  { id: "security", label: "Security" },
  { id: "system", label: "System" },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Right-rail alerts drawer (UI-Page-Spec A9) for platform portal.
 */
export function AlertsDrawer({ open, onClose }: Props) {
  const [filter, setFilter] = useState<AlertCategory>("all");
  const [items, setItems] = useState<AlertItem[]>(() => listLivePlatformAlerts());

  useEffect(() => {
    return subscribePlatformAlerts((live) => {
      setItems((prev) => {
        const liveIds = new Set(live.map((l) => l.id));
        const keptMeta = prev.filter((a) => liveIds.has(a.id));
        return live.map((l) => {
          const prevLive = keptMeta.find((p) => p.id === l.id);
          return prevLive ? { ...l, unread: prevLive.unread } : l;
        });
      });
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const visible = useMemo(
    () =>
      filter === "all" ? items : items.filter((a) => a.category === filter),
    [filter, items],
  );

  const unreadCount = items.filter((a) => a.unread).length;

  const markAllRead = () => {
    setItems((prev) => prev.map((a) => ({ ...a, unread: false })));
  };

  const markRead = (id: string) => {
    setItems((prev) =>
      prev.map((a) => (a.id === id ? { ...a, unread: false } : a)),
    );
  };

  if (!open) return null;

  return createPortal(
    <div className="alerts-drawer-root" role="presentation">
      <button
        type="button"
        className="alerts-drawer-backdrop"
        aria-label="Close alerts"
        onClick={onClose}
      />
      <aside
        className="alerts-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="alerts-drawer-title"
      >
        <header className="alerts-drawer__head">
          <div className="alerts-drawer__title-row">
            <h2 id="alerts-drawer-title">Alerts</h2>
            {unreadCount > 0 ? (
              <span className="alerts-drawer__badge">{unreadCount}</span>
            ) : null}
          </div>
          <div className="alerts-drawer__head-actions">
            <button
              type="button"
              className="alerts-drawer__text-btn"
              onClick={markAllRead}
              disabled={unreadCount === 0}
            >
              Mark all read
            </button>
            <button
              type="button"
              className="alerts-drawer__close"
              aria-label="Close alerts"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>

        <div className="alerts-drawer__filters" role="tablist" aria-label="Alert filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`alerts-drawer__filter${filter === f.id ? " is-on" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="alerts-drawer__list">
          {visible.length === 0 ? (
            <p className="alerts-drawer__empty">No notifications</p>
          ) : (
            visible.map((a) => (
              <article
                key={a.id}
                className={`alerts-drawer__item${a.unread ? " is-unread" : ""} tone-${a.tone ?? "info"}`}
              >
                <div className="alerts-drawer__item-top">
                  <h3 className="alerts-drawer__item-title">{a.title}</h3>
                  <time className="alerts-drawer__item-time">{a.at}</time>
                </div>
                <p className="alerts-drawer__item-body">{a.body}</p>
                <div className="alerts-drawer__item-foot">
                  <span className="alerts-drawer__cat">{a.category}</span>
                  {a.href ? (
                    <Link
                      to={a.href}
                      className="alerts-drawer__link"
                      onClick={() => {
                        markRead(a.id);
                        onClose();
                      }}
                    >
                      {a.hrefLabel ?? "Open"}
                    </Link>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

export function countUnreadAlerts(): number {
  return listLivePlatformAlerts().filter((a) => a.unread).length;
}
