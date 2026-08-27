import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  getPlatformOrgPolicy,
  updatePlatformOrgPolicy,
  type Session,
} from "./api";
import { sessionIsPlatformOwner } from "./org";
import { PlatformPending } from "./ui/PlatformPending";

type Props = { session: Session };

/** Phase 1 — fixed agent nesting (agent → sub-agent → merchant). Not editable in UI. */
const PHASE1_MAX_AGENT_DEPTH = 2;

const SESSION_OPTIONS = [15, 30, 60, 120] as const;

/** B13 — Global platform settings (Figma `b13-global-settings`). */
export function PlatformSettingsPage({ session }: Props) {
  const canEdit = useMemo(() => sessionIsPlatformOwner(session), [session]);
  /** Kept for PUT payload; not shown — Phase 1 locks depth at 2. */
  const [maxAgentDepth, setMaxAgentDepth] = useState(PHASE1_MAX_AGENT_DEPTH);
  const [mfaEnforcement, setMfaEnforcement] = useState(true);
  const [savedMfaEnforcement, setSavedMfaEnforcement] = useState(true);
  const [sessionTimeoutMin, setSessionTimeoutMin] = useState(30);
  const [savedSessionTimeoutMin, setSavedSessionTimeoutMin] = useState(30);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savePulse, setSavePulse] = useState(false);

  const dirty =
    mfaEnforcement !== savedMfaEnforcement ||
    sessionTimeoutMin !== savedSessionTimeoutMin;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const policy = await getPlatformOrgPolicy();
      // Prefer live policy so we never lower depth under an existing tree on save.
      setMaxAgentDepth(
        Number.isInteger(policy.maxAgentDepth)
          ? policy.maxAgentDepth
          : PHASE1_MAX_AGENT_DEPTH,
      );
      setMfaEnforcement(policy.mfaEnforcement);
      setSavedMfaEnforcement(policy.mfaEnforcement);
      setSessionTimeoutMin(policy.sessionTimeoutMinutes);
      setSavedSessionTimeoutMin(policy.sessionTimeoutMinutes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;

    if (
      !(SESSION_OPTIONS as readonly number[]).includes(sessionTimeoutMin)
    ) {
      setError("Session timeout must be 15, 30, 60, or 120 minutes");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const policy = await updatePlatformOrgPolicy({
        maxAgentDepth,
        mfaEnforcement,
        sessionTimeoutMinutes: sessionTimeoutMin,
      });
      setMaxAgentDepth(policy.maxAgentDepth);
      setMfaEnforcement(policy.mfaEnforcement);
      setSavedMfaEnforcement(policy.mfaEnforcement);
      setSessionTimeoutMin(policy.sessionTimeoutMinutes);
      setSavedSessionTimeoutMin(policy.sessionTimeoutMinutes);
      setMessage(
        "Org policy saved. MFA enforcement and session timeout apply on next login / session refresh.",
      );
      setSavePulse(true);
      window.setTimeout(() => setSavePulse(false), 400);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save settings");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <PlatformPending
        title="Loading platform settings"
        copy="Fetching org policy and operator configuration."
      />
    );
  }

  return (
    <form className="plat-settings" onSubmit={onSave}>
      <header className="plat-settings__head">
        {canEdit ? (
          <button
            type="submit"
            className={`plat-settings__save${savePulse ? " is-pulse" : ""}`}
            disabled={busy || !dirty}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        ) : (
          <p className="plat-settings__readonly">Owner edit · Admin/Viewer read-only</p>
        )}
      </header>

      {error ? <p className="error plat-settings__flash">{error}</p> : null}
      {message ? (
        <p className="banner banner-ok plat-settings__flash">{message}</p>
      ) : null}
      {dirty && canEdit ? (
        <p className="plat-settings__dirty" role="status">
          Unsaved changes
        </p>
      ) : null}

      <div className="plat-settings__grid">
        <div className="plat-settings__col">
          <section
            className="plat-settings__card"
            style={{ animationDelay: "0ms" }}
          >
            <h3 className="plat-settings__card-title">Security &amp; MFA</h3>
            <div className="plat-settings__row">
              <div className="plat-settings__row-copy">
                <p className="plat-settings__row-label">Your MFA</p>
                <p className="plat-settings__row-hint">
                  {session.mfaEnrolled
                    ? "Authenticator enabled on this account"
                    : "Enroll a TOTP authenticator for step-up actions"}
                </p>
              </div>
              <Link className="plat-settings__link" to="/platform/settings/security">
                {session.mfaEnrolled ? "Manage" : "Enroll"}
              </Link>
            </div>
            <div className="plat-settings__row">
              <div className="plat-settings__row-copy">
                <p className="plat-settings__row-label">MFA enforcement</p>
                <p className="plat-settings__row-hint">
                  Live org policy — force Owner/Admin TOTP enrollment across
                  portals. Settlement / xPub still require enrolled MFA.
                </p>
              </div>
              <button
                type="button"
                className={`plat-settings__switch${
                  mfaEnforcement ? " is-on" : ""
                }`}
                role="switch"
                aria-checked={mfaEnforcement}
                disabled={!canEdit || busy}
                onClick={() => setMfaEnforcement((v) => !v)}
              >
                <span className="plat-settings__switch-knob" />
              </button>
            </div>
            <div className="plat-settings__row">
              <div className="plat-settings__row-copy">
                <p className="plat-settings__row-label">Session timeout</p>
                <p className="plat-settings__row-hint">
                  Live org policy — sliding session TTL on login and keep-alive
                  refresh
                </p>
              </div>
              {canEdit ? (
                <select
                  className="plat-settings__select"
                  value={sessionTimeoutMin}
                  disabled={busy}
                  onChange={(e) =>
                    setSessionTimeoutMin(Number(e.target.value))
                  }
                >
                  {SESSION_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              ) : (
                <span className="plat-settings__value">
                  {sessionTimeoutMin} min
                </span>
              )}
            </div>
          </section>
        </div>
      </div>
    </form>
  );
}
