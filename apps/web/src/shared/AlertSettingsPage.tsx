import { FormEvent, useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ApiError,
  type NotificationPreference,
  type NotificationPreferenceList,
} from "../merchant/api";
import { AuthToast } from "../auth/AuthToast";
import { GoldWaves } from "./GoldWaves";

export type AlertIconKind =
  | "payment"
  | "anomaly"
  | "wallet"
  | "key"
  | "webhook"
  | "bill"
  | "org"
  | "team"
  | "health"
  | "commission";

export type AlertEventMeta = {
  eventType: string;
  label: string;
  blurb: string;
  icon?: AlertIconKind;
  /** Sends email (default true). */
  email?: boolean;
  /** Shows in the Alerts drawer (default true). */
  inApp?: boolean;
};

type Props = {
  orgId: string | null;
  events: AlertEventMeta[];
  load: (orgId: string) => Promise<NotificationPreferenceList>;
  save: (orgId: string, items: NotificationPreference[]) => Promise<NotificationPreferenceList>;
  onSaved?: (list: NotificationPreferenceList) => void;
  noOrgMessage?: string;
};

const svg = (children: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

const ICONS: Record<AlertIconKind | "bell", ReactNode> = {
  bell: svg(
    <>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5l1.5-1.5Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>,
  ),
  payment: svg(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
    </>,
  ),
  anomaly: svg(
    <>
      <path d="M10.3 4.2 3.2 17a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4M12 16.8v.1" />
    </>,
  ),
  wallet: svg(
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
      <rect x="4" y="8" width="16" height="11" rx="2.5" />
      <path d="M16 13.5h.1" />
    </>,
  ),
  key: svg(
    <>
      <circle cx="8" cy="15" r="3.5" />
      <path d="m10.5 12.5 8-8M16 7l2 2M14 9l1.5 1.5" />
    </>,
  ),
  webhook: svg(
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1-1" />
    </>,
  ),
  bill: svg(
    <>
      <path d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8v-17Z" />
      <path d="M9 8.5h6M9 12h6M9 15.5h3" />
    </>,
  ),
  org: svg(
    <>
      <path d="M4 20.5h16M6 20.5V5.5l7-2v17M13 8.5h5v12" />
      <path d="M9 8h1M9 11.5h1M9 15h1M15.5 12h.5M15.5 15.5h.5" />
    </>,
  ),
  team: svg(
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.6a3 3 0 0 1 0 5.8M17.5 14.2A5.5 5.5 0 0 1 20.5 19" />
    </>,
  ),
  health: svg(<path d="M3.5 12h4l2-5 4 10 2-5h5" />),
  commission: svg(
    <>
      <ellipse cx="12" cy="6.5" rx="6.5" ry="2.5" />
      <path d="M5.5 6.5v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5" />
      <path d="M5.5 11.5v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5" />
    </>,
  ),
};

function formatLoadError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Failed to load notification preferences";
}

/** Alerts tab: each member's own email / in-app choices (all portals). */
export function AlertSettingsPage({
  orgId,
  events,
  load,
  save,
  onSaved,
  noOrgMessage = "No organization is available for this account.",
}: Props) {
  const [items, setItems] = useState<NotificationPreference[]>([]);
  const [emailAvailable, setEmailAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const reload = useCallback(async () => {
    if (!orgId) {
      setLoadError(noOrgMessage);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setLoadError(null);
    try {
      const loaded = await load(orgId);
      setEmailAvailable(loaded.emailAvailable);
      setItems(loaded.items);
      setDirty(false);
    } catch (err) {
      setLoadError(formatLoadError(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, load, noOrgMessage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function toggle(eventType: string, channel: "email" | "inApp", value: boolean) {
    if (channel === "email" && !emailAvailable) return;
    setItems((prev) =>
      prev.map((row) => (row.eventType === eventType ? { ...row, [channel]: value } : row)),
    );
    setDirty(true);
    setOkMsg(null);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !dirty) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const saved = await save(orgId, items);
      setEmailAvailable(saved.emailAvailable);
      setItems(saved.items);
      setDirty(false);
      setOkMsg("Alert settings saved.");
      onSaved?.(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const byType = new Map(items.map((row) => [row.eventType, row]));
  const rows = events.filter((meta) => byType.has(meta.eventType));
  const emailOn = rows.filter(
    (meta) => meta.email !== false && emailAvailable && byType.get(meta.eventType)!.email,
  ).length;
  const inAppOn = rows.filter(
    (meta) => meta.inApp !== false && byType.get(meta.eventType)!.inApp,
  ).length;
  const activeCount = rows.filter((meta) => {
    const row = byType.get(meta.eventType)!;
    return (
      (meta.email !== false && emailAvailable && row.email) ||
      (meta.inApp !== false && row.inApp)
    );
  }).length;
  const ready = !loading && !loadError;

  return (
    <div className="plat-settings plat-settings--merchant plat-alerts">
      <AuthToast
        message={error ?? okMsg}
        tone={error ? "error" : "ok"}
        onDismiss={() => {
          setError(null);
          setOkMsg(null);
        }}
      />

      <section className="plat-settings__card plat-alerts__card">
        <header className="plat-alerts__head">
          <span className="plat-alerts__head-icon" aria-hidden>
            {ICONS.bell}
          </span>
          <div className="plat-alerts__head-copy">
            <h1 className="plat-alerts__title">Alerts</h1>
            <p className="plat-alerts__subtitle">
              Your personal settings — teammates choose their own.
            </p>
          </div>
          <GoldWaves id="plat-alerts-wave" className="plat-alerts__waves" />
          <button
            type="submit"
            form="plat-alerts-form"
            className="btn-primary btn-inline plat-alerts__save"
            disabled={saving || !dirty || !ready}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </header>

        {ready ? (
          <div className="plat-alerts__summary">
            <div className="plat-alerts__summary-main">
              <span className="plat-alerts__summary-text">
                <strong>{activeCount}</strong> of {rows.length} alerts on
              </span>
              <span className="plat-alerts__meter" aria-hidden>
                <span
                  style={{
                    width: `${rows.length ? Math.round((activeCount / rows.length) * 100) : 0}%`,
                  }}
                />
              </span>
            </div>
            <div className="plat-alerts__summary-pills">
              {emailAvailable ? (
                <span className="plat-alerts__pill">
                  <span className="plat-alerts__pill-dot" aria-hidden />
                  Email · {emailOn}
                </span>
              ) : (
                <span
                  className="plat-alerts__pill plat-alerts__pill--warn"
                  title="Outbound mail is not configured on the server."
                >
                  <span className="plat-alerts__pill-dot" aria-hidden />
                  Email unavailable
                </span>
              )}
              <span className="plat-alerts__pill">
                <span className="plat-alerts__pill-dot" aria-hidden />
                In-app · {inAppOn}
              </span>
            </div>
          </div>
        ) : null}

        <div className="plat-alerts__body">
          {loading ? (
            <p className="muted">Loading alert settings…</p>
          ) : loadError ? (
            <p className="plat-alerts__load-error">{loadError}</p>
          ) : (
            <form
              id="plat-alerts-form"
              className="plat-alerts__list"
              onSubmit={(e) => void onSave(e)}
              aria-label="Alert settings"
            >
              <div className="plat-alerts__cols" aria-hidden>
                <span>Event</span>
                <span>Email</span>
                <span>In-app</span>
              </div>
              {rows.map((meta) => {
                const row = byType.get(meta.eventType)!;
                const hasEmail = meta.email !== false;
                const hasInApp = meta.inApp !== false;
                const on =
                  (hasEmail && emailAvailable && row.email) || (hasInApp && row.inApp);
                return (
                  <div
                    key={meta.eventType}
                    className={`plat-alerts__row${on ? " is-on" : ""}`}
                  >
                    <span className="plat-alerts__icon" aria-hidden>
                      {ICONS[meta.icon ?? "bell"]}
                    </span>
                    <div className="plat-alerts__event">
                      <strong>{meta.label}</strong>
                      {meta.blurb ? <span>{meta.blurb}</span> : null}
                    </div>
                    <div className="plat-alerts__cell" data-label="Email">
                      {hasEmail ? (
                        <label
                          className="plat-alerts__toggle"
                          title={emailAvailable ? undefined : "Email is not configured on the server"}
                        >
                          <input
                            type="checkbox"
                            role="switch"
                            checked={emailAvailable ? row.email : false}
                            disabled={saving || !emailAvailable}
                            onChange={(e) => toggle(meta.eventType, "email", e.target.checked)}
                          />
                          <span className="plat-alerts__switch" aria-hidden />
                          <span className="sr-only">Email for {meta.label}</span>
                        </label>
                      ) : (
                        <span className="plat-alerts__na" title="In-app only">
                          —
                        </span>
                      )}
                    </div>
                    <div className="plat-alerts__cell" data-label="In-app">
                      {hasInApp ? (
                        <label className="plat-alerts__toggle">
                          <input
                            type="checkbox"
                            role="switch"
                            checked={row.inApp}
                            disabled={saving}
                            onChange={(e) => toggle(meta.eventType, "inApp", e.target.checked)}
                          />
                          <span className="plat-alerts__switch" aria-hidden />
                          <span className="sr-only">In-app for {meta.label}</span>
                        </label>
                      ) : (
                        <span className="plat-alerts__na" title="Email only">
                          —
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </form>
          )}
        </div>

        <footer className="plat-alerts__foot">
          <span className="plat-alerts__foot-icon" aria-hidden>
            i
          </span>
          Email goes to your sign-in address. In-app alerts appear under the bell.
        </footer>
      </section>
    </div>
  );
}
