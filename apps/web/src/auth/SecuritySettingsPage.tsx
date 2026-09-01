import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  changePassword,
  getSession,
  resetMfa,
  updateProfile,
  type Session,
} from "../merchant/api";
import { FieldControl } from "../ui/FieldControl";
import { AuthToast } from "./AuthToast";
import { MfaEnrollmentWizard } from "./MfaEnrollmentWizard";
import { sessionCanEnrollMfa } from "./mfaSession";
import {
  evaluatePasswordPolicy,
} from "./passwordPolicy";
import {
  sessionDisplayLabel,
  sessionHasCustomDisplayName,
} from "./profileIdentity";

type Props = {
  session: Session;
  /** Visual shell: platform uses plat-settings cards; others use merchant panels. */
  variant?: "platform" | "agent" | "merchant";
  /** Omit page chrome when rendered inside the Profile Setting dialog. */
  embedded?: boolean;
  onSessionRefresh?: (session: Session) => void;
};

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

function formatTimezoneLabel(tz: string): string {
  if (tz === "UTC") return "UTC — Coordinated Universal Time";
  try {
    const offset = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    const label = tz.replace(/_/g, " ");
    return offset ? `${label} (${offset})` : label;
  } catch {
    return tz.replace(/_/g, " ");
  }
}

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
  const [timezone, setTimezone] = useState(session.timezone || "UTC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(session.displayName ?? "");
    setTimezone(session.timezone || "UTC");
  }, [session.displayName, session.timezone]);

  const dirty = useMemo(() => {
    const name = displayName.trim();
    const savedName = (session.displayName ?? "").trim();
    return (
      name !== savedName ||
      timezone !== (session.timezone || "UTC")
    );
  }, [displayName, timezone, session]);

  const timezoneChoices = useMemo(() => {
    const set = new Set<string>(TIMEZONE_OPTIONS);
    if (timezone) set.add(timezone);
    return [...set];
  }, [timezone]);

  const sidebarLabel = useMemo(() => sessionDisplayLabel(session), [session]);
  const hasCustomName = sessionHasCustomDisplayName(session);
  const namePlaceholder = hasCustomName ? "Display name" : sidebarLabel;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || busy) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const next = await updateProfile({
        displayName: displayName.trim() || null,
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
        <AuthToast
          message={error}
          tone="error"
          onDismiss={() => setError(null)}
        />
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
                placeholder={namePlaceholder}
                autoComplete="name"
              />
            </FieldControl>
            {!hasCustomName ? (
              <p className="plat-settings__row-hint profile-settings-card__name-hint">
                Shown in the sidebar as{" "}
                <strong>{sidebarLabel}</strong> until you save a display name.
              </p>
            ) : null}
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
        <div className="plat-settings__row plat-settings__row--stack">
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
                    {formatTimezoneLabel(tz)}
                  </option>
                ))}
              </select>
            </FieldControl>
            <p className="plat-settings__row-hint profile-settings-card__timezone-hint">
              Order times, bills, and activity in this portal display in this
              timezone.
            </p>
          </label>
        </div>
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
      <AuthToast
        message={error}
        tone="error"
        onDismiss={() => setError(null)}
      />
      <h2>Profile</h2>
      <p className="muted">
        Display name and timezone for timestamps in this portal.
      </p>
      <label className="field">
        <span>Name</span>
        <input
          className="field-control"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={busy}
          maxLength={120}
          placeholder={namePlaceholder}
          autoComplete="name"
        />
        {!hasCustomName ? (
          <span className="muted" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
            Shown in the sidebar as <strong>{sidebarLabel}</strong> until you save
            a display name.
          </span>
        ) : null}
      </label>
      <label className="field">
        <span>Email</span>
        <input className="field-control" value={session.email} disabled readOnly />
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
              {formatTimezoneLabel(tz)}
            </option>
          ))}
        </select>
        <span className="muted" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
          Order times, bills, and activity display in this timezone.
        </span>
      </label>
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
        <AuthToast
          message={error}
          tone="error"
          onDismiss={() => setError(null)}
        />
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
      <AuthToast
        message={error}
        tone="error"
        onDismiss={() => setError(null)}
      />
      <h2>Change password</h2>
      <label className="field" htmlFor="settings-current-password">
        <span>Current password</span>
        <FieldControl
          showPassword={showCurrent}
          onTogglePassword={() => setShowCurrent((v) => !v)}
          toggleDisabled={busy}
        >
          <input
            id="settings-current-password"
            className="field-control"
            type={showCurrent ? "text" : "password"}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={busy}
            autoComplete="current-password"
          />
        </FieldControl>
      </label>
      <label className="field" htmlFor="settings-new-password">
        <span>New password</span>
        <FieldControl
          showPassword={showNew}
          onTogglePassword={() => setShowNew((v) => !v)}
          toggleDisabled={busy}
        >
          <input
            id="settings-new-password"
            className="field-control"
            type={showNew ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={busy}
            autoComplete="new-password"
          />
        </FieldControl>
      </label>
      {passwordPolicyMeter}
      <label className="field" htmlFor="settings-confirm-password">
        <span>Confirm new password</span>
        <FieldControl
          showPassword={showConfirm}
          onTogglePassword={() => setShowConfirm((v) => !v)}
          toggleDisabled={busy}
        >
          <input
            id="settings-confirm-password"
            className="field-control"
            type={showConfirm ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={busy}
            autoComplete="new-password"
          />
        </FieldControl>
      </label>
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
  const enrollmentPending = session.mfaEnrollmentPending === true;
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
            void getSession().then((next) => {
              onSessionRefresh?.(next);
              setWizardOpen(false);
              setMessage(
                "MFA enabled. You will need your authenticator on next sign-in.",
              );
            });
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
            enrollmentPending={enrollmentPending}
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
        enrollmentPending={enrollmentPending}
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
  enrollmentPending = false,
  onStartEnrollment,
}: {
  session: Session;
  variant: "platform" | "agent" | "merchant";
  onSessionRefresh?: (session: Session) => void;
  canEnroll?: boolean;
  enrolled?: boolean;
  enrollmentPending?: boolean;
  onStartEnrollment?: () => void;
}) {
  const [mfaEnforcement, setMfaEnforcement] = useState(
    session.mfaEnforcement === true,
  );
  const [sessionTimeoutMin, setSessionTimeoutMin] = useState(
    session.sessionTimeoutMinutes ?? 120,
  );
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replacePassword, setReplacePassword] = useState("");
  const [showReplacePassword, setShowReplacePassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    setMfaEnforcement(session.mfaEnforcement === true);
    setSessionTimeoutMin(session.sessionTimeoutMinutes ?? 120);
  }, [session.mfaEnforcement, session.sessionTimeoutMinutes]);

  const dirty =
    mfaEnforcement !== (session.mfaEnforcement === true) ||
    sessionTimeoutMin !== (session.sessionTimeoutMinutes ?? 120);

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

  async function onReplaceAuthenticator() {
    if (!replacePassword.trim() || busy) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const next = await resetMfa(replacePassword);
      onSessionRefresh?.(next);
      setReplaceOpen(false);
      setReplacePassword("");
      onStartEnrollment?.();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to replace authenticator",
      );
    } finally {
      setBusy(false);
    }
  }

  const mfaBadge = enrolled
    ? "enabled"
    : enrollmentPending
      ? "pending"
      : "off";

  if (variant === "platform") {
    return (
      <section className="plat-settings__card profile-settings-card">
        <AuthToast
          message={error}
          tone="error"
          onDismiss={() => setError(null)}
        />
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
                <>
                  <p className="plat-settings__card-note">
                    Two-step verification is enabled. You will be challenged with a
                    6-digit code on each sign-in. The setup secret cannot be viewed
                    after enrollment.
                  </p>
                  {!replaceOpen ? (
                    <button
                      type="button"
                      className="plat-settings__link"
                      disabled={busy}
                      onClick={() => {
                        setReplaceOpen(true);
                        setError(null);
                      }}
                    >
                      Replace authenticator
                    </button>
                  ) : (
                    <div className="profile-mfa-replace">
                      <p className="plat-settings__row-hint">
                        Enter your password to reset MFA, then set up a new
                        authenticator and copy the secret during setup.
                      </p>
                      <label
                        className="plat-settings__field"
                        htmlFor="profile-mfa-replace-password"
                      >
                        <span>Current password</span>
                        <FieldControl
                          icon="lock"
                          showPassword={showReplacePassword}
                          onTogglePassword={() =>
                            setShowReplacePassword((v) => !v)
                          }
                          toggleDisabled={busy}
                        >
                          <input
                            id="profile-mfa-replace-password"
                            className="plat-settings__input"
                            type={showReplacePassword ? "text" : "password"}
                            value={replacePassword}
                            onChange={(e) => setReplacePassword(e.target.value)}
                            disabled={busy}
                            autoComplete="current-password"
                          />
                        </FieldControl>
                      </label>
                      <div className="profile-mfa-replace__actions">
                        <button
                          type="button"
                          className="login-btn-secondary profile-mfa-replace__cancel"
                          disabled={busy}
                          onClick={() => {
                            setReplaceOpen(false);
                            setReplacePassword("");
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="plat-settings__link"
                          disabled={busy || !replacePassword.trim()}
                          onClick={() => void onReplaceAuthenticator()}
                        >
                          {busy ? "Resetting…" : "Reset & set up again"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : enrollmentPending ? (
                <>
                  <p className="plat-settings__card-note">
                    Setup is in progress. Reopen enrollment to view the QR code
                    and copy the manual secret again (same code as before).
                  </p>
                  <button
                    type="button"
                    className="plat-settings__link"
                    disabled={busy}
                    onClick={onStartEnrollment}
                  >
                    Continue MFA setup
                  </button>
                </>
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
              className={`plat-team__mfa${
                mfaBadge === "enabled"
                  ? " is-on"
                  : mfaBadge === "pending"
                    ? " is-pending"
                    : ""
              }`}
            >
              <span className="plat-team__mfa-dot" aria-hidden />
              {mfaBadge === "enabled"
                ? "Enabled"
                : mfaBadge === "pending"
                  ? "Pending"
                  : "Off"}
            </span>
          </div>
        </div>
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
      <AuthToast
        message={error}
        tone="error"
        onDismiss={() => setError(null)}
      />
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
