import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  ASSET_NETWORK_REGISTRY,
  NetworkId,
} from "@cryptogate/domain";
import {
  ApiError,
  getPlatformOrgPolicy,
  updatePlatformOrgPolicy,
  type Session,
} from "./api";
import { sessionIsPlatformOwner } from "./org";
import { PlatformPending } from "./ui/PlatformPending";

type Props = { session: Session };

type LocalPrefs = {
  mfaEnforcement: boolean;
  sessionTimeoutMin: number;
  anomaliesBeforeSuspension: number;
  maxSingleSettlementUsd: number;
  cooldownMinutes: number;
};

const PREFS_KEY = "cryptogate.platform.settings.prefs";

const DEFAULT_PREFS: LocalPrefs = {
  mfaEnforcement: true,
  sessionTimeoutMin: 30,
  anomaliesBeforeSuspension: 5,
  maxSingleSettlementUsd: 50_000,
  cooldownMinutes: 30,
};

const SESSION_OPTIONS = [15, 30, 60, 120] as const;
const COOLDOWN_OPTIONS = [15, 30, 60, 120, 1440] as const;

function loadPrefs(): LocalPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<LocalPrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function networkEnabled(network: string): boolean {
  return ASSET_NETWORK_REGISTRY.some(
    (row) => row.network === network && row.enabled,
  );
}

function formatCooldown(min: number): string {
  if (min >= 1440) return `${min / 1440} day`;
  return `${min} min`;
}

/** B13 — Global platform settings (Figma `b13-global-settings`). */
export function PlatformSettingsPage({ session }: Props) {
  const canEdit = useMemo(() => sessionIsPlatformOwner(session), [session]);
  const [maxAgentDepth, setMaxAgentDepth] = useState("2");
  const [savedDepth, setSavedDepth] = useState("2");
  const [prefs, setPrefs] = useState<LocalPrefs>(DEFAULT_PREFS);
  const [savedPrefs, setSavedPrefs] = useState<LocalPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savePulse, setSavePulse] = useState(false);

  const dirty =
    maxAgentDepth !== savedDepth ||
    JSON.stringify(prefs) !== JSON.stringify(savedPrefs);

  const tronOn = networkEnabled(NetworkId.Tron);
  const ethOn = networkEnabled(NetworkId.Ethereum);
  const btcOn = networkEnabled(NetworkId.Bitcoin);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const policy = await getPlatformOrgPolicy();
      const depth = String(policy.maxAgentDepth);
      setMaxAgentDepth(depth);
      setSavedDepth(depth);
      const local = loadPrefs();
      setPrefs(local);
      setSavedPrefs(local);
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

  function patchPrefs(patch: Partial<LocalPrefs>) {
    setPrefs((prev) => ({ ...prev, ...patch }));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;

    const depth = Number(maxAgentDepth);
    if (!Number.isInteger(depth) || depth < 0 || depth > 5) {
      setError("Max agent depth must be an integer 0–5");
      return;
    }

    if (depth < Number(savedDepth)) {
      const ok = window.confirm(
        "Lowering max agent depth may block new sub-agents under existing trees. Continue?",
      );
      if (!ok) return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (depth !== Number(savedDepth)) {
        const policy = await updatePlatformOrgPolicy({ maxAgentDepth: depth });
        const next = String(policy.maxAgentDepth);
        setMaxAgentDepth(next);
        setSavedDepth(next);
      }
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      setSavedPrefs(prefs);
      setMessage("Settings saved. Org policy applies immediately; other prefs are operator review defaults.");
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
        <div>
          <h2 className="plat-settings__title">
            Platform strategy &amp; security configurations
          </h2>
          <p className="plat-settings__subtitle">
            Org policy is live. Security and limit defaults are operator review
            prefs until dedicated APIs ship.
          </p>
        </div>
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
                  Browser preference only — not org policy API. Owner/Admin
                  enrollment is enforced by the portal gate.
                </p>
              </div>
              <button
                type="button"
                className={`plat-settings__switch${
                  prefs.mfaEnforcement ? " is-on" : ""
                }`}
                role="switch"
                aria-checked={prefs.mfaEnforcement}
                disabled={!canEdit || busy}
                onClick={() =>
                  patchPrefs({ mfaEnforcement: !prefs.mfaEnforcement })
                }
              >
                <span className="plat-settings__switch-knob" />
              </button>
            </div>
            <div className="plat-settings__row">
              <div className="plat-settings__row-copy">
                <p className="plat-settings__row-label">Session timeout</p>
                <p className="plat-settings__row-hint">
                  Browser preference only — API session TTL is server-configured
                </p>
              </div>
              {canEdit ? (
                <select
                  className="plat-settings__select"
                  value={prefs.sessionTimeoutMin}
                  disabled={busy}
                  onChange={(e) =>
                    patchPrefs({
                      sessionTimeoutMin: Number(e.target.value),
                    })
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
                  {prefs.sessionTimeoutMin} min
                </span>
              )}
            </div>
          </section>

          <section
            className="plat-settings__card"
            style={{ animationDelay: "40ms" }}
          >
            <div className="plat-settings__card-head">
              <h3 className="plat-settings__card-title">Network integration</h3>
              <Link
                to="/platform/settings/networks"
                className="plat-settings__link"
              >
                Network catalog →
              </Link>
            </div>
            <div className="plat-settings__row">
              <p className="plat-settings__row-label">TRC-20 (Tron)</p>
              <span
                className={`plat-settings__switch is-readonly${
                  tronOn ? " is-on" : ""
                }`}
                role="img"
                aria-label={tronOn ? "Enabled" : "Catalogued"}
              >
                <span className="plat-settings__switch-knob" />
              </span>
            </div>
            <div className="plat-settings__row">
              <p className="plat-settings__row-label">ERC-20 (Ethereum)</p>
              <span
                className={`plat-settings__switch is-readonly${
                  ethOn ? " is-on" : ""
                }`}
                role="img"
                aria-label={ethOn ? "Enabled" : "Catalogued"}
              >
                <span className="plat-settings__switch-knob" />
              </span>
            </div>
            <div className="plat-settings__row">
              <p className="plat-settings__row-label">Bitcoin watcher</p>
              <span
                className={`plat-settings__switch is-readonly${
                  btcOn ? " is-on" : ""
                }`}
                role="img"
                aria-label={btcOn ? "Enabled" : "Catalogued"}
              >
                <span className="plat-settings__switch-knob" />
              </span>
            </div>
            <p className="plat-settings__card-note">
              Live enablement is managed in the Network catalog. Switches above
              reflect current registry status.
            </p>
          </section>
        </div>

        <div className="plat-settings__col">
          <section
            className="plat-settings__card"
            style={{ animationDelay: "80ms" }}
          >
            <h3 className="plat-settings__card-title">Agent policies</h3>
            <div className="plat-settings__row">
              <div className="plat-settings__row-copy">
                <p className="plat-settings__row-label">
                  Max agent hierarchy depth
                </p>
                <p className="plat-settings__row-hint">
                  Phase 1 default is 2 (agent → sub-agent → merchant)
                </p>
              </div>
              {canEdit ? (
                <input
                  className="plat-settings__number"
                  type="number"
                  min={0}
                  max={5}
                  value={maxAgentDepth}
                  disabled={busy}
                  onChange={(e) => setMaxAgentDepth(e.target.value)}
                  aria-label="Max agent hierarchy depth"
                />
              ) : (
                <span className="plat-settings__value">
                  {maxAgentDepth} levels
                </span>
              )}
            </div>
            <div className="plat-settings__row">
              <p className="plat-settings__row-label">
                Anomalies before suspension
              </p>
              {canEdit ? (
                <input
                  className="plat-settings__number"
                  type="number"
                  min={1}
                  max={99}
                  value={prefs.anomaliesBeforeSuspension}
                  disabled={busy}
                  onChange={(e) =>
                    patchPrefs({
                      anomaliesBeforeSuspension: Number(e.target.value) || 1,
                    })
                  }
                />
              ) : (
                <span className="plat-settings__value">
                  {prefs.anomaliesBeforeSuspension} triggers
                </span>
              )}
            </div>
          </section>

          <section
            className="plat-settings__card"
            style={{ animationDelay: "120ms" }}
          >
            <h3 className="plat-settings__card-title">Platform limits</h3>
            <div className="plat-settings__row">
              <p className="plat-settings__row-label">Max single settlement</p>
              {canEdit ? (
                <div className="plat-settings__affix">
                  <span aria-hidden>$</span>
                  <input
                    className="plat-settings__number plat-settings__number--wide"
                    type="number"
                    min={1000}
                    step={1000}
                    value={prefs.maxSingleSettlementUsd}
                    disabled={busy}
                    onChange={(e) =>
                      patchPrefs({
                        maxSingleSettlementUsd: Number(e.target.value) || 0,
                      })
                    }
                  />
                  <span className="plat-settings__unit">USDT</span>
                </div>
              ) : (
                <span className="plat-settings__value">
                  ${prefs.maxSingleSettlementUsd.toLocaleString()} USDT
                </span>
              )}
            </div>
            <div className="plat-settings__row">
              <div className="plat-settings__row-copy">
                <p className="plat-settings__row-label">Cool-down duration</p>
                <p className="plat-settings__row-hint">
                  Settlement address / xPub change cool-down
                </p>
              </div>
              {canEdit ? (
                <select
                  className="plat-settings__select"
                  value={prefs.cooldownMinutes}
                  disabled={busy}
                  onChange={(e) =>
                    patchPrefs({ cooldownMinutes: Number(e.target.value) })
                  }
                >
                  {COOLDOWN_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {formatCooldown(m)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="plat-settings__value">
                  {formatCooldown(prefs.cooldownMinutes)}
                </span>
              )}
            </div>
          </section>
        </div>
      </div>
    </form>
  );
}
