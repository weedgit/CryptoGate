import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  changePassword,
  updateProfile,
  type Session,
} from "../merchant/api";
import { FieldControl } from "../ui/FieldControl";
import { MfaEnrollmentWizard } from "./MfaEnrollmentWizard";
import { sessionCanEnrollMfa } from "./mfaSession";
import {
  evaluatePasswordPolicy,
} from "./passwordPolicy";

type Props = {
  session: Session;
  /** Visual shell: platform uses plat-settings cards; others use merchant panels. */
  variant?: "platform" | "agent" | "merchant";
  /** Omit page chrome when rendered inside the Profile Setting dialog. */
  embedded?: boolean;
  onSessionRefresh?: (session: Session) => void;
};

const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "th", label: "ไทย" },
] as const;

const TIMEZONE_OPTIONS = [
  "UTC",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Manila",
  "Australia/Sydney",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
] as const;

const SESSION_OPTIONS = [15, 30, 60, 120] as const;

function ProfileForm({
  session,
  variant,
  onSessionRefresh,
}: {
  session: Session;
  variant: "platform" | "agent" | "merchant";
  onSessionRefresh?: (session: Session) => void;
}) {
  const [displayName, setDisplayName] = useState(session.displayName ?? "");
  const [locale, setLocale] = useState(session.locale || "en");
  const [timezone, setTimezone] = useState(session.timezone || "UTC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(session.displayName ?? "");
    setLocale(session.locale || "en");
    setTimezone(session.timezone || "UTC");
  }, [session.displayName, session.locale, session.timezone]);

  const dirty = useMemo(() => {
    const name = displayName.trim();
    const savedName = (session.displayName ?? "").trim();
    return (
      name !== savedName ||
      locale !== (session.locale || "en") ||
      timezone !== (session.timezone || "UTC")
    );
  }, [displayName, locale, timezone, session]);

  const timezoneChoices = useMemo(() => {
    const set = new Set<string>(TIMEZONE_OPTIONS);
    if (timezone) set.add(timezone);
    return [...set];
  }, [timezone]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || busy) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const next = await updateProfile({
        displayName: displayName.trim() || null,
        locale,
        timezone,
      });
      onSessionRefresh?.(next);
      setOk("Profile saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save profile");
    } finally {
      setBusy(false);
    }
  }

  if (variant === "platform") {
    return (
      <form className="plat-settings__card profile-settings-card" onSubmit={onSubmit}>
        <div className="plat-settings__card-head">
          <h3 className="plat-settings__card-title">Account</h3>
        </div>
        <div className="plat-settings__row plat-settings__row--stack">
          <label className="plat-settings__field" htmlFor="profile-name">
            <span>Display name</span>
            <FieldControl icon="user">
              <input
                id="profile-name"
                className="plat-settings__input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={busy}
                maxLength={120}
                placeholder="Display name"
                autoComplete="name"
              />
            </FieldControl>
          </label>
        </div>
        <div className="plat-settings__row plat-settings__row--stack">
          <label className="plat-settings__field" htmlFor="profile-email">
            <span>Email</span>
            <FieldControl icon="mail">
              <input
                id="profile-email"
                className="plat-settings__input"
                value={session.email}
                disabled
                readOnly
              />
            </FieldControl>
          </label>
        </div>
        <div className="profile-settings-card__grid">
          <label className="plat-settings__field" htmlFor="profile-locale">
            <span>Language</span>
            <FieldControl icon="globe">
              <select
                id="profile-locale"
                className="plat-settings__select plat-settings__select--block"
                value={locale}
                disabled={busy}
                onChange={(e) => setLocale(e.target.value)}
              >
                {LOCALE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FieldControl>
          </label>
          <label className="plat-settings__field" htmlFor="profile-timezone">
            <span>Timezone</span>
            <FieldControl icon="clock">
              <select
                id="profile-timezone"
                className="plat-settings__select plat-settings__select--block"
                value={timezone}
                disabled={busy}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {timezoneChoices.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </FieldControl>
          </label>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {ok ? <p className="plat-settings__flash" role="status">{ok}</p> : null}
        <div className="profile-settings-card__actions">
          <button
            type="submit"
            className="plat-settings__save"
            disabled={busy || !dirty}
          >
            {busy ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="panel settings-panel" onSubmit={onSubmit}>
      <h2>Profile</h2>
      <p className="muted">
        Display name and regional preferences for this account.
      </p>
      <label className="field">
        <span>Name</span>
        <input
          className="field-control"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={busy}
          maxLength={120}
          placeholder="Display name"
          autoComplete="name"
        />
      </label>
      <label className="field">
        <span>Email</span>
        <input className="field-control" value={session.email} disabled readOnly />
      </label>
      <label className="field">
        <span>Language</span>
        <select
          className="field-control"
          value={locale}
          disabled={busy}
          onChange={(e) => setLocale(e.target.value)}
        >
          {LOCALE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Timezone</span>
        <select
          className="field-control"
          value={timezone}
          disabled={busy}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {timezoneChoices.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="banner banner-ok">{ok}</p> : null}
      <button type="submit" className="btn-primary" disabled={busy || !dirty}>
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

function ChangePasswordForm({
  variant,
  onSessionRefresh,
}: {
  variant: "platform" | "agent" | "merchant";
  onSessionRefresh?: (session: Session) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const policy = evaluatePasswordPolicy(newPassword);

  const canSubmit = useMemo(() => {
    return (
      currentPassword.length > 0 &&
      newPassword.length > 0 &&
      confirmPassword.length > 0 &&
      newPassword === confirmPassword &&
      policy.valid
    );
  }, [confirmPassword, currentPassword, newPassword, policy.valid]);

  const policyItems = [
    { key: "length", label: "At least 12 characters", ok: policy.hasLength },
    { key: "case", label: "Upper and lower case letters", ok: policy.hasMixedCase },
    { key: "number", label: "At least one number", ok: policy.hasNumber },
  ] as const;

  const passedCount = policyItems.filter((item) => item.ok).length;
  const strengthLabel =
    passedCount === 0
      ? "Too weak"
      : passedCount === 1
        ? "Weak"
        : passedCount === 2
          ? "Fair"
          : "Strong";
  const strengthTone =
    passedCount === 0
      ? "idle"
      : passedCount === 1
        ? "weak"
        : passedCount === 2
          ? "fair"
          : "strong";

  const passwordPolicyMeter = (
      <div
        className={`profile-password-meter is-${strengthTone}`}
        aria-live="polite"
        aria-label={`Password strength: ${strengthLabel}. ${passedCount} of ${policyItems.length} rules met.`}
      >
        <div
          className="profile-password-meter__track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={policyItems.length}
          aria-valuenow={passedCount}
        >
          {policyItems.map((item, index) => (
            <span
              key={item.key}
              className={`profile-password-meter__seg${index < passedCount ? " is-on" : ""}`}
            />
          ))}
        </div>
        <div className="profile-password-meter__foot">
          <ul className="profile-password-meter__rules">
            {policyItems.map((item) => (
              <li
                key={item.key}
                className={`profile-password-meter__rule${item.ok ? " is-met" : ""}`}
              >
                <span className="profile-password-meter__check" aria-hidden />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
          <span className="profile-password-meter__score">{strengthLabel}</span>
        </div>
      </div>
    );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const next = await changePassword({ currentPassword, newPassword });
      onSessionRefresh?.(next);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setOk("Password updated.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to change password",
      );
    } finally {
      setBusy(false);
    }
  }

  if (variant === "platform") {
    return (
      <form
        className="plat-settings__card profile-settings-card plat-settings__card--wide"
        onSubmit={onSubmit}
      >
        <div className="plat-settings__card-head">
          <h3 className="plat-settings__card-title">Change password</h3>
        </div>
        <div className="profile-settings-card__grid profile-settings-card__grid--password">
          <label className="plat-settings__field" htmlFor="profile-current-password">
            <span>Current password</span>
            <FieldControl
              icon="lock"
              showPassword={showCurrent}
              onTogglePassword={() => setShowCurrent((v) => !v)}
              toggleDisabled={busy}
            >
              <input
                id="profile-current-password"
                className="plat-settings__input"
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={busy}
                autoComplete="current-password"
              />
            </FieldControl>
          </label>
          <label className="plat-settings__field" htmlFor="profile-new-password">
            <span>New password</span>
            <FieldControl
              icon="lock"
              showPassword={showNew}
              onTogglePassword={() => setShowNew((v) => !v)}
              toggleDisabled={busy}
            >
              <input
                id="profile-new-password"
                className="plat-settings__input"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
              />
            </FieldControl>
          </label>
          <label className="plat-settings__field" htmlFor="profile-confirm-password">
            <span>Confirm new password</span>
            <FieldControl
              icon="lock"
              showPassword={showConfirm}
              onTogglePassword={() => setShowConfirm((v) => !v)}
              toggleDisabled={busy}
            >
              <input
                id="profile-confirm-password"
                className="plat-settings__input"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
              />
            </FieldControl>
          </label>
          {passwordPolicyMeter}
        </div>
        {error ? <p className="error">{error}</p> : null}
        {ok ? (
          <p className="plat-settings__flash" role="status">
            {ok}
          </p>
        ) : null}
        <div className="profile-settings-card__actions">
          <button
            type="submit"
            className="plat-settings__save"
            disabled={busy || !canSubmit}
          >
            {busy ? "Saving…" : "Change password"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="panel settings-panel" onSubmit={onSubmit}>
      <h2>Change password</h2>
      <label className="field">
        <span>Current password</span>
        <input
          className="field-control"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          disabled={busy}
          autoComplete="current-password"
        />
      </label>
      <label className="field">
        <span>New password</span>
        <input
          className="field-control"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={busy}
          autoComplete="new-password"
        />
      </label>
      {passwordPolicyMeter}
      <label className="field">
        <span>Confirm new password</span>
        <input
          className="field-control"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={busy}
          autoComplete="new-password"
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="banner banner-ok">{ok}</p> : null}
      <button type="submit" className="btn-primary" disabled={busy || !canSubmit}>
        {busy ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}

export function SecuritySettingsPage({
  session,
  variant = "merchant",
  embedded = false,
  onSessionRefresh,
}: Props) {
  const canEnroll = sessionCanEnrollMfa(session);
  const enrolled = session.mfaEnrolled === true;
  const [wizardOpen, setWizardOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** Modal always uses platform card chrome for a consistent polish. */
  const chrome: "platform" | "agent" | "merchant" = embedded
    ? "platform"
    : variant;

  if (wizardOpen) {
    return (
      <div className="auth-flow-overlay">
        <MfaEnrollmentWizard
          onCancel={() => setWizardOpen(false)}
          onComplete={() => {
            setWizardOpen(false);
            setMessage("MFA enabled. You will need your authenticator on next sign-in.");
            onSessionRefresh?.({ ...session, mfaEnrolled: true });
          }}
        />
      </div>
    );
  }

  if (chrome === "platform") {
    return (
      <div className={`plat-settings${embedded ? " plat-settings--embedded" : ""}`}>
        {!embedded ? (
          <header className="plat-settings__head">
            <div>
              <h2 className="plat-settings__title">Profile</h2>
              <p className="plat-settings__subtitle">
                Your account details, sign-in MFA, and session preferences.
              </p>
            </div>
          </header>
        ) : null}

        {message ? (
          <p className="plat-settings__flash" role="status">
            {message}
          </p>
        ) : null}

        <div
          className={
            embedded ? "plat-settings__grid plat-settings__grid--embedded" : "plat-settings__stack"
          }
        >
          <ProfileForm
            session={session}
            variant="platform"
            onSessionRefresh={onSessionRefresh}
          />

          <SecurityPrefsForm
            session={session}
            variant="platform"
            onSessionRefresh={onSessionRefresh}
            canEnroll={canEnroll}
            enrolled={enrolled}
            onStartEnrollment={() => {
              setMessage(null);
              setWizardOpen(true);
            }}
          />

          <ChangePasswordForm
            variant="platform"
            onSessionRefresh={onSessionRefresh}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`settings-page${embedded ? " settings-page--embedded" : ""}`}>
      <ProfileForm
        session={session}
        variant={variant}
        onSessionRefresh={onSessionRefresh}
      />
      <SecurityPrefsForm
        session={session}
        variant={variant}
        onSessionRefresh={onSessionRefresh}
        canEnroll={canEnroll}
        enrolled={enrolled}
        onStartEnrollment={() => {
          setMessage(null);
          setWizardOpen(true);
        }}
      />
      <ChangePasswordForm
        variant={variant}
        onSessionRefresh={onSessionRefresh}
      />
      {message ? <p className="banner banner-ok">{message}</p> : null}
    </div>
  );
}

function SecurityPrefsForm({
  session,
  variant,
  onSessionRefresh,
  canEnroll = false,
  enrolled = false,
  onStartEnrollment,
}: {
  session: Session;
  variant: "platform" | "agent" | "merchant";
  onSessionRefresh?: (session: Session) => void;
  canEnroll?: boolean;
  enrolled?: boolean;
  onStartEnrollment?: () => void;
}) {
  const [mfaEnforcement, setMfaEnforcement] = useState(
    session.mfaEnforcement === true,
  );
  const [sessionTimeoutMin, setSessionTimeoutMin] = useState(
    session.sessionTimeoutMinutes ?? 30,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    setMfaEnforcement(session.mfaEnforcement === true);
    setSessionTimeoutMin(session.sessionTimeoutMinutes ?? 30);
  }, [session.mfaEnforcement, session.sessionTimeoutMinutes]);

  const dirty =
    mfaEnforcement !== (session.mfaEnforcement === true) ||
    sessionTimeoutMin !== (session.sessionTimeoutMinutes ?? 30);

  async function onSave() {
    if (!dirty || busy) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const next = await updateProfile({
        mfaEnforcement,
        sessionTimeoutMinutes: sessionTimeoutMin,
      });
      onSessionRefresh?.(next);
      setOk("Security preferences saved.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to save preferences",
      );
    } finally {
      setBusy(false);
    }
  }

  if (variant === "platform") {
    return (
      <section className="plat-settings__card profile-settings-card">
        <div className="plat-settings__card-head">
          <h3 className="plat-settings__card-title">Sign-in &amp; session</h3>
        </div>
        <div className="plat-settings__row">
          <div className="plat-settings__row-copy">
            <p className="plat-settings__row-label">Require two-step verification</p>
            <p className="plat-settings__row-hint">
              When on, this account must finish TOTP enrollment before using the
              portal (Owner/Admin). Settlement and xPub still need MFA when
              enrolled.
            </p>
          </div>
          <button
            type="button"
            className={`plat-settings__switch${mfaEnforcement ? " is-on" : ""}`}
            role="switch"
            aria-checked={mfaEnforcement}
            disabled={busy}
            onClick={() => setMfaEnforcement((v) => !v)}
          >
            <span className="plat-settings__switch-knob" />
          </button>
        </div>
        <div className="plat-settings__row">
          <div className="plat-settings__row-copy">
            <p className="plat-settings__row-label">Session timeout</p>
            <p className="plat-settings__row-hint">
              How long your session stays active with sliding refresh.
            </p>
          </div>
          <FieldControl icon="clock">
            <select
              className="plat-settings__select"
              value={sessionTimeoutMin}
              disabled={busy}
              onChange={(e) => setSessionTimeoutMin(Number(e.target.value))}
            >
              {SESSION_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </FieldControl>
        </div>
        <div className="plat-settings__subsection">
          <div className="plat-settings__row">
            <div className="plat-settings__row-copy">
              <p className="plat-settings__row-label">Authenticator</p>
              <p className="plat-settings__row-hint">
                TOTP authenticator (Google Authenticator, 1Password, etc.). Used
                for settlement, xPub, and step-up when enrolled.
              </p>
              {!canEnroll ? (
                <p className="plat-settings__card-note">
                  Only Owner or Administrator may enroll MFA for this account.
                </p>
              ) : enrolled ? (
                <p className="plat-settings__card-note">
                  Two-step verification is enabled. You will be challenged with a
                  6-digit code on each sign-in.
                </p>
              ) : (
                <button
                  type="button"
                  className="plat-settings__link"
                  disabled={busy}
                  onClick={onStartEnrollment}
                >
                  Start MFA enrollment
                </button>
              )}
            </div>
            <span
              className={`plat-team__mfa${enrolled ? " is-on" : " is-pending"}`}
            >
              <span className="plat-team__mfa-dot" aria-hidden />
              {enrolled ? "Enabled" : "Pending"}
            </span>
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {ok ? <p className="plat-settings__flash" role="status">{ok}</p> : null}
        <div className="profile-settings-card__actions">
          <button
            type="button"
            className="plat-settings__save"
            disabled={busy || !dirty}
            onClick={() => void onSave()}
          >
            {busy ? "Saving…" : "Save preferences"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="panel settings-panel">
      <h2>Sign-in &amp; session</h2>
      <p className="muted">Personal preferences for this account only.</p>
      <label className="field" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          type="checkbox"
          checked={mfaEnforcement}
          disabled={busy}
          onChange={(e) => setMfaEnforcement(e.target.checked)}
        />
        <span>Require two-step verification (Owner/Admin)</span>
      </label>
      <label className="field">
        <span>Session timeout</span>
        <select
          className="field-control"
          value={sessionTimeoutMin}
          disabled={busy}
          onChange={(e) => setSessionTimeoutMin(Number(e.target.value))}
        >
          {SESSION_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </label>
      <hr style={{ margin: "16px 0", border: 0, borderTop: "1px solid rgba(255,255,255,0.08)" }} />
      <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Authenticator</h3>
      <p className="muted">
        TOTP authenticator (Google Authenticator, 1Password, etc.). Once enabled,
        settlement and xPub changes need a verification code.
      </p>
      <p className="settings-mfa-status" role="status">
        Status:{" "}
        <strong className={enrolled ? "ok" : ""}>
          {enrolled ? "Enabled" : "Not enrolled"}
        </strong>
      </p>
      {!canEnroll ? (
        <p className="muted">
          Only Owner or Administrator may enroll MFA for this account.
        </p>
      ) : enrolled ? (
        <p className="muted">
          Two-step verification is enabled. You will need your authenticator on
          next sign-in.
        </p>
      ) : (
        <button type="button" className="btn-primary" onClick={onStartEnrollment}>
          Start MFA enrollment
        </button>
      )}
      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="banner banner-ok">{ok}</p> : null}
      <button
        type="button"
        className="btn-primary"
        disabled={busy || !dirty}
        onClick={() => void onSave()}
      >
        {busy ? "Saving…" : "Save preferences"}
      </button>
    </div>
  );
}
