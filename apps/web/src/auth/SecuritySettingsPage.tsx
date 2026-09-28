import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { browserTimeZone } from "../shared/dateTime";
import { allTimeZones } from "../shared/timeZoneOptions";
import {
  ApiError,
  changePassword,
  clearPosPin,
  getPosPinStatus,
  getSession,
  resetMfa,
  sendEmailOtp,
  sendPhoneOtp,
  setPosPin,
  updateProfile,
  verifyEmailOtp,
  verifyPhoneOtp,
  type Session,
} from "../merchant/api";
import { formatPhoneInput } from "../shared/phoneFormat";
import { readOrgIconFile } from "../shared/orgBrand";
import { FieldControl } from "../ui/FieldControl";
import { AuthToast } from "./AuthToast";
import { ContactOtpModal } from "./ContactOtpModal";
import { MfaEnrollmentWizard } from "./MfaEnrollmentWizard";
import { sessionCanEnrollMfa } from "./mfaSession";
import {
  evaluatePasswordPolicy,
} from "./passwordPolicy";
import {
  sessionHasAvatar,
} from "./profileIdentity";
import { DefaultUserAvatar } from "./DefaultUserAvatar";

type Props = {
  session: Session;
  /** Visual shell: platform uses plat-settings cards; others use merchant panels. */
  variant?: "platform" | "agent" | "merchant";
  /** Omit page chrome when rendered inside the Profile Setting dialog. */
  embedded?: boolean;
  onSessionRefresh?: (session: Session) => void;
};

/** Unconfirmed profiles still hold the UTC default; start from the device zone instead. */
function profileTimeZoneDefault(session: Session): string {
  if (session.timezoneConfirmed === true && session.timezone) return session.timezone;
  return browserTimeZone();
}

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

function ContactVerifyBadge({ verified }: { verified: boolean }) {
  return (
    <span
      className={`b3-profile__verify${verified ? " is-verified" : " is-pending"}`}
    >
      {verified ? "Verified" : "Unverified"}
    </span>
  );
}

type ContactOtpPending = {
  channel: "email" | "phone";
  destination: string;
  pendingChange: boolean;
  initialCode?: string;
};

function ProfileContactVerify({
  session,
  variant,
  onSessionRefresh,
}: {
  session: Session;
  variant: "platform" | "agent" | "merchant";
  onSessionRefresh?: (session: Session) => void;
}) {
  const platform = variant === "platform";
  const actionBtn = platform
    ? "login-btn-secondary profile-action-btn"
    : "btn-secondary btn-inline";
  const primaryBtn = platform ? "plat-settings__save profile-action-btn" : "btn-primary btn-inline";
  const [email, setEmail] = useState(session.email);
  const [phone, setPhone] = useState(formatPhoneInput(session.phone ?? ""));
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [phoneSent, setPhoneSent] = useState(false);
  const [otpModal, setOtpModal] = useState<ContactOtpPending | null>(null);
  const [busy, setBusy] = useState<"email" | "phone" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (!editingEmail) {
      setEmail(session.email);
      if (session.emailVerified) {
        setEmailSent(false);
      }
    }
  }, [session.email, session.emailVerified, editingEmail]);

  useEffect(() => {
    if (!editingPhone) {
      setPhone(formatPhoneInput(session.phone ?? ""));
      if (session.phoneVerified) {
        setPhoneSent(false);
      }
    }
  }, [session.phone, session.phoneVerified, editingPhone]);

  const emailLocked = session.emailVerified === true && !editingEmail;
  const phoneLocked = session.phoneVerified === true && !editingPhone;
  const showEmailVerify = !emailLocked;
  const showPhoneVerify = !phoneLocked;

  function startChangeEmail() {
    setEditingEmail(true);
    setEmailSent(false);
    setOtpModal(null);
    setError(null);
    setOk(null);
  }

  function cancelChangeEmail() {
    setEditingEmail(false);
    setEmail(session.email);
    setEmailSent(false);
    setOtpModal(null);
    setError(null);
    setOk(null);
  }

  function startChangePhone() {
    setEditingPhone(true);
    setPhoneSent(false);
    setOtpModal(null);
    setError(null);
    setOk(null);
  }

  function cancelChangePhone() {
    setEditingPhone(false);
    setPhone(formatPhoneInput(session.phone ?? ""));
    setPhoneSent(false);
    setOtpModal(null);
    setError(null);
    setOk(null);
  }

  async function sendEmail() {
    const next = email.trim().toLowerCase();
    if (!next.includes("@") || next.length < 5) {
      setError("Enter a valid email address");
      return;
    }
    if (editingEmail && next === session.email.toLowerCase()) {
      setError("Enter a new email address to change it");
      return;
    }
    setBusy("email");
    setError(null);
    setOk(null);
    try {
      const result = await sendEmailOtp(next);
      if (result.session) onSessionRefresh?.(result.session);
      const destination = result.email ?? next;
      setEmail(destination);
      if (result.status === "already_verified") {
        setEditingEmail(false);
        setEmailSent(false);
        setOtpModal(null);
        setOk("Email already verified.");
        return;
      }
      setEmailSent(true);
      setOtpModal({
        channel: "email",
        destination,
        pendingChange: result.pendingChange === true,
        initialCode: result.devCode,
      });
      setOk(
        result.pendingChange
          ? "Code sent. Confirm to switch email."
          : "Email code sent.",
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send email code");
    } finally {
      setBusy(null);
    }
  }

  async function sendPhone() {
    const normalized = phone.trim();
    if (normalized.length < 8) {
      setError("Enter a valid mobile number with country code");
      return;
    }
    const currentDigits = (session.phone ?? "").replace(/\D/g, "");
    const nextDigits = normalized.replace(/\D/g, "");
    if (editingPhone && currentDigits && nextDigits === currentDigits) {
      setError("Enter a new mobile number to change it");
      return;
    }
    setBusy("phone");
    setError(null);
    setOk(null);
    try {
      const result = await sendPhoneOtp(normalized);
      if (result.session) onSessionRefresh?.(result.session);
      const destination = result.phone ?? normalized;
      setPhone(formatPhoneInput(destination));
      if (result.status === "already_verified") {
        setEditingPhone(false);
        setPhoneSent(false);
        setOtpModal(null);
        setOk("Phone already verified.");
        return;
      }
      setPhoneSent(true);
      setOtpModal({
        channel: "phone",
        destination,
        pendingChange: result.pendingChange === true,
        initialCode: result.devCode,
      });
      setOk(
        result.pendingChange
          ? "Code sent. Confirm to switch phone."
          : "SMS code sent.",
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send SMS code");
    } finally {
      setBusy(null);
    }
  }

  const emailBlock = (
    <>
      <div className="profile-contact__head">
        <span>Email</span>
        <ContactVerifyBadge verified={session.emailVerified === true && !editingEmail} />
      </div>
      {platform ? (
        <FieldControl icon="mail">
          <input
            id="profile-email"
            className="plat-settings__input"
            value={email}
            disabled={emailLocked || busy === "email" || emailSent}
            readOnly={emailLocked}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
          />
        </FieldControl>
      ) : (
        <input
          className="field-control"
          value={email}
          disabled={emailLocked || busy === "email" || emailSent}
          readOnly={emailLocked}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
        />
      )}
      {emailLocked ? (
        <div className="profile-contact__verify">
          <button
            type="button"
            className={actionBtn}
            disabled={busy !== null}
            onClick={startChangeEmail}
          >
            Update email
          </button>
        </div>
      ) : null}
      {showEmailVerify ? (
        <div className="profile-contact__verify">
          {editingEmail ? (
            <p className={platform ? "plat-settings__row-hint" : "muted"} style={{ marginTop: 6 }}>
              Current email stays active until you confirm.
            </p>
          ) : null}
          {emailSent ? (
            <button
              type="button"
              className={primaryBtn}
              disabled={busy !== null}
              onClick={() =>
                setOtpModal({
                  channel: "email",
                  destination: email.trim().toLowerCase(),
                  pendingChange: editingEmail,
                })
              }
            >
              Enter code
            </button>
          ) : (
            <button
              type="button"
              className={primaryBtn}
              disabled={busy !== null || !email.trim().includes("@")}
              onClick={() => void sendEmail()}
            >
              {busy === "email" ? "Sending…" : "Verify email"}
            </button>
          )}
          {editingEmail ? (
            <button
              type="button"
              className={actionBtn}
              disabled={busy !== null}
              onClick={cancelChangeEmail}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const phoneBlock = (
    <>
      <div className="profile-contact__head">
        <span>Phone</span>
        <ContactVerifyBadge verified={session.phoneVerified === true && !editingPhone} />
      </div>
      {platform ? (
        <FieldControl icon="phone">
          <input
            id="profile-phone"
            className="plat-settings__input"
            value={phone}
            disabled={phoneLocked || busy === "phone" || phoneSent}
            onChange={(e) => setPhone(formatPhoneInput(e.target.value, phone))}
            placeholder="+65 8123 4567"
            autoComplete="tel"
            inputMode="tel"
          />
        </FieldControl>
      ) : (
        <input
          className="field-control"
          value={phone}
          disabled={phoneLocked || busy === "phone" || phoneSent}
          onChange={(e) => setPhone(formatPhoneInput(e.target.value, phone))}
          placeholder="+65 8123 4567"
          autoComplete="tel"
          inputMode="tel"
        />
      )}
      {phoneLocked ? (
        <div className="profile-contact__verify">
          <button
            type="button"
            className={actionBtn}
            disabled={busy !== null}
            onClick={startChangePhone}
          >
            Update phone
          </button>
        </div>
      ) : null}
      {showPhoneVerify ? (
        <div className="profile-contact__verify">
          {editingPhone ? (
            <p className={platform ? "plat-settings__row-hint" : "muted"} style={{ margin: 0 }}>
              Current number stays active until you confirm.
            </p>
          ) : null}
          {phoneSent ? (
            <button
              type="button"
              className={primaryBtn}
              disabled={busy !== null}
              onClick={() =>
                setOtpModal({
                  channel: "phone",
                  destination: phone.trim(),
                  pendingChange: editingPhone,
                })
              }
            >
              Enter code
            </button>
          ) : (
            <button
              type="button"
              className={primaryBtn}
              disabled={busy !== null || phone.trim().length < 8}
              onClick={() => void sendPhone()}
            >
              {busy === "phone" ? "Sending…" : "Verify phone"}
            </button>
          )}
          {editingPhone ? (
            <button
              type="button"
              className={actionBtn}
              disabled={busy !== null}
              onClick={cancelChangePhone}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const otpDialog =
    otpModal != null ? (
      <ContactOtpModal
        key={`${otpModal.channel}:${otpModal.destination}:${otpModal.initialCode ?? ""}`}
        channel={otpModal.channel}
        destination={otpModal.destination}
        pendingChange={otpModal.pendingChange}
        initialCode={otpModal.initialCode}
        onClose={() => setOtpModal(null)}
        onVerify={async (code) => {
          try {
            if (otpModal.channel === "email") {
              onSessionRefresh?.(await verifyEmailOtp(code));
              setEditingEmail(false);
              setEmailSent(false);
              setOk("Email verified.");
            } else {
              onSessionRefresh?.(await verifyPhoneOtp(code));
              setEditingPhone(false);
              setPhoneSent(false);
              setOk("Phone verified.");
            }
            setError(null);
          } catch (err) {
            throw new Error(
              err instanceof ApiError ? err.message : "Invalid verification code",
            );
          }
        }}
        onResend={async () => {
          try {
            if (otpModal.channel === "email") {
              const result = await sendEmailOtp(otpModal.destination);
              if (result.session) onSessionRefresh?.(result.session);
              if (result.status === "already_verified") {
                setEditingEmail(false);
                setEmailSent(false);
                setOtpModal(null);
                setOk("Email already verified.");
                return {};
              }
              return { code: result.devCode };
            }
            const result = await sendPhoneOtp(otpModal.destination);
            if (result.session) onSessionRefresh?.(result.session);
            if (result.status === "already_verified") {
              setEditingPhone(false);
              setPhoneSent(false);
              setOtpModal(null);
              setOk("Phone already verified.");
              return {};
            }
            return { code: result.devCode };
          } catch (err) {
            throw new Error(
              err instanceof ApiError ? err.message : "Could not resend code",
            );
          }
        }}
      />
    ) : null;

  if (platform) {
    return (
      <>
        <div className="plat-settings__row plat-settings__row--stack">
          <div className="plat-settings__field">{emailBlock}</div>
        </div>
        <div className="plat-settings__row plat-settings__row--stack">
          <div className="plat-settings__field">{phoneBlock}</div>
        </div>
        {error ? (
          <p className="plat-settings__flash plat-settings__flash--error" role="alert">
            {error}
          </p>
        ) : null}
        {ok ? <p className="plat-settings__flash" role="status">{ok}</p> : null}
        {otpDialog}
      </>
    );
  }

  return (
    <>
      <label className="field">{emailBlock}</label>
      <label className="field">{phoneBlock}</label>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <AuthToast message={ok} tone="ok" onDismiss={() => setOk(null)} />
      {otpDialog}
    </>
  );
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [firstName, setFirstName] = useState(session.firstName ?? "");
  const [lastName, setLastName] = useState(session.lastName ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    sessionHasAvatar(session) ? (session.avatarUrl ?? null) : null,
  );
  const [timezone, setTimezone] = useState(() => profileTimeZoneDefault(session));
  const [busy, setBusy] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(session.firstName ?? "");
    setLastName(session.lastName ?? "");
    setAvatarUrl(
      sessionHasAvatar(session) ? (session.avatarUrl ?? null) : null,
    );
    setTimezone(profileTimeZoneDefault(session));
  }, [session.firstName, session.lastName, session.avatarUrl, session.timezone, session.timezoneConfirmed]);

  const savedAvatar = sessionHasAvatar(session)
    ? (session.avatarUrl ?? null)
    : null;

  const dirty = useMemo(() => {
    return (
      firstName.trim() !== (session.firstName ?? "").trim() ||
      lastName.trim() !== (session.lastName ?? "").trim() ||
      avatarUrl !== savedAvatar ||
      timezone !== (session.timezone || "UTC") ||
      session.timezoneConfirmed !== true
    );
  }, [firstName, lastName, avatarUrl, timezone, session, savedAvatar]);

  const timezoneChoices = useMemo(() => {
    const zones = allTimeZones();
    return timezone && !zones.includes(timezone) ? [timezone, ...zones] : zones;
  }, [timezone]);

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setOk(null);
    setReadingFile(true);
    try {
      const dataUrl = await readOrgIconFile(file);
      setAvatarUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not use that image");
    } finally {
      setReadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || busy || readingFile) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const next = await updateProfile({
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        avatarUrl,
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

  const saving = busy || readingFile;

  const avatarEditor = (
    <div className="profile-avatar-editor">
      <div
        className={`profile-avatar-editor__preview${
          avatarUrl ? "" : " profile-avatar-editor__preview--default"
        }`}
        aria-hidden
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="profile-avatar-editor__img" />
        ) : (
          <DefaultUserAvatar className="profile-avatar-editor__img profile-avatar-editor__img--default" />
        )}
      </div>
      <div className="profile-avatar-editor__copy">
        <span className="profile-avatar-editor__label">Avatar</span>
        <div className="profile-avatar-editor__actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
            className="sr-only"
            disabled={saving}
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="login-btn-secondary profile-avatar-editor__btn"
            disabled={saving}
            onClick={() => fileInputRef.current?.click()}
          >
            {readingFile
              ? "Reading…"
              : avatarUrl
                ? "Change photo…"
                : "Upload photo…"}
          </button>
        </div>
      </div>
    </div>
  );

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
          {avatarEditor}
        </div>
        <div className="plat-settings__row plat-settings__row--stack">
          <label className="plat-settings__field" htmlFor="profile-first-name">
            <span>First name</span>
            <FieldControl icon="user">
              <input
                id="profile-first-name"
                className="plat-settings__input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={saving}
                maxLength={80}
                placeholder="First name"
                autoComplete="given-name"
              />
            </FieldControl>
          </label>
        </div>
        <div className="plat-settings__row plat-settings__row--stack">
          <label className="plat-settings__field" htmlFor="profile-last-name">
            <span>Last name</span>
            <FieldControl icon="user">
              <input
                id="profile-last-name"
                className="plat-settings__input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={saving}
                maxLength={80}
                placeholder="Last name"
                autoComplete="family-name"
              />
            </FieldControl>
          </label>
        </div>
        <ProfileContactVerify
          session={session}
          variant="platform"
          onSessionRefresh={onSessionRefresh}
        />
        <div className="plat-settings__row plat-settings__row--stack">
          <label className="plat-settings__field" htmlFor="profile-timezone">
            <span>Timezone</span>
            <FieldControl icon="clock">
              <select
                id="profile-timezone"
                className="plat-settings__select plat-settings__select--block"
                value={timezone}
                disabled={saving}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {timezoneChoices.map((tz) => (
                  <option key={tz} value={tz}>
                    {formatTimezoneLabel(tz)}
                  </option>
                ))}
              </select>
            </FieldControl>
          </label>
        </div>
        {ok ? <p className="plat-settings__flash" role="status">{ok}</p> : null}
        <div className="profile-settings-card__actions">
          <button
            type="submit"
            className="plat-settings__save"
            disabled={saving || !dirty}
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
      {avatarEditor}
      <label className="field">
        <span>First name</span>
        <input
          className="field-control"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          disabled={saving}
          maxLength={80}
          placeholder="First name"
          autoComplete="given-name"
        />
      </label>
      <label className="field">
        <span>Last name</span>
        <input
          className="field-control"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          disabled={saving}
          maxLength={80}
          placeholder="Last name"
          autoComplete="family-name"
        />
      </label>
      <ProfileContactVerify
        session={session}
        variant={variant}
        onSessionRefresh={onSessionRefresh}
      />
      <label className="field">
        <span>Timezone</span>
        <select
          className="field-control"
          value={timezone}
          disabled={saving}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {timezoneChoices.map((tz) => (
            <option key={tz} value={tz}>
              {formatTimezoneLabel(tz)}
            </option>
          ))}
        </select>
      </label>
      <AuthToast message={ok} tone="ok" onDismiss={() => setOk(null)} />
      <button type="submit" className="btn-primary" disabled={saving || !dirty}>
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
      <AuthToast message={ok} tone="ok" onDismiss={() => setOk(null)} />
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

  const wizard = wizardOpen ? (
    <MfaEnrollmentWizard
      variant="modal"
      onCancel={() => setWizardOpen(false)}
      onComplete={() => {
        void getSession().then((next) => {
          onSessionRefresh?.(next);
          setWizardOpen(false);
          setMessage("Authenticator enabled.");
        });
      }}
    />
  ) : null;

  if (chrome === "platform") {
    return (
      <div className={`plat-settings${embedded ? " plat-settings--embedded" : ""}`}>
        {!embedded ? (
          <header className="plat-settings__head">
            <div>
              <h2 className="plat-settings__title">Profile</h2>
              <p className="plat-settings__subtitle">
                Name, contact, and sign-in security.
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
        {wizard}
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
      {variant === "merchant" ? <PosPinForm variant={variant} /> : null}
      <AuthToast message={message} tone="ok" onDismiss={() => setMessage(null)} />
      {wizard}
    </div>
  );
}

function PosPinForm({
  variant,
}: {
  variant: "platform" | "agent" | "merchant";
}) {
  const [configured, setConfigured] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    void getPosPinStatus()
      .then((s) => setConfigured(s.configured))
      .catch(() => setConfigured(false));
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!/^\d{4,8}$/.test(pin)) {
      setError("POS PIN must be 4–8 digits");
      return;
    }
    if (pin !== confirm) {
      setError("PINs do not match");
      return;
    }
    if (configured && !currentPin) {
      setError("Enter your current POS PIN to replace it");
      return;
    }
    setBusy(true);
    try {
      await setPosPin({
        pin,
        currentPin: configured ? currentPin : undefined,
      });
      setConfigured(true);
      setPin("");
      setConfirm("");
      setCurrentPin("");
      setOk("POS PIN saved. Cashier terminals unlock with this PIN.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save POS PIN");
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    setError(null);
    setOk(null);
    if (!currentPin) {
      setError("Enter your current POS PIN to clear it");
      return;
    }
    setBusy(true);
    try {
      await clearPosPin(currentPin);
      setConfigured(false);
      setCurrentPin("");
      setOk("POS PIN cleared.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not clear POS PIN");
    } finally {
      setBusy(false);
    }
  }

  const cardClass =
    variant === "platform" ? "plat-settings-card" : "profile-settings-card";

  return (
    <form className={cardClass} onSubmit={(e) => void onSave(e)}>
      <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Cashier POS PIN</h3>
      <p className="settings-mfa-status" role="status">
        Status:{" "}
        <strong className={configured ? "ok" : ""}>
          {configured ? "Configured" : "Not set"}
        </strong>
      </p>
      {configured ? (
        <label className="field">
          <span>Current POS PIN</span>
          <FieldControl icon="lock">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              maxLength={8}
            />
          </FieldControl>
        </label>
      ) : null}
      <label className="field">
        <span>New POS PIN (4–8 digits)</span>
        <FieldControl icon="lock">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            maxLength={8}
          />
        </FieldControl>
      </label>
      <label className="field">
        <span>Confirm POS PIN</span>
        <FieldControl icon="lock">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={confirm}
            onChange={(e) =>
              setConfirm(e.target.value.replace(/\D/g, "").slice(0, 8))
            }
            maxLength={8}
          />
        </FieldControl>
      </label>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <AuthToast message={ok} tone="ok" onDismiss={() => setOk(null)} />
      <div className="profile-settings-card__actions">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : configured ? "Replace POS PIN" : "Set POS PIN"}
        </button>
        {configured ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void onClear()}
          >
            Clear POS PIN
          </button>
        ) : null}
      </div>
    </form>
  );
}

function SecurityPrefsForm({
  session: _session,
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
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replacePassword, setReplacePassword] = useState("");
  const [showReplacePassword, setShowReplacePassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

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
          <h3 className="plat-settings__card-title">Authenticator</h3>
        </div>
        <div className="plat-settings__subsection">
          <div className="plat-settings__row">
            <div className="plat-settings__row-copy">
              {!canEnroll ? (
                <p className="plat-settings__card-note">
                  Not available for this role.
                </p>
              ) : enrolled ? (
                <>
                  {!replaceOpen ? (
                    <button
                      type="button"
                      className="login-btn-secondary profile-action-btn"
                      disabled={busy}
                      onClick={() => {
                        setReplaceOpen(true);
                        setError(null);
                      }}
                    >
                      Change authenticator
                    </button>
                  ) : (
                    <div className="profile-mfa-replace">
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
                          className="login-btn-secondary profile-action-btn"
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
                          className="plat-settings__save profile-action-btn"
                          disabled={busy || !replacePassword.trim()}
                          onClick={() => void onReplaceAuthenticator()}
                        >
                          {busy ? "Resetting…" : "Confirm reset"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : enrollmentPending ? (
                <button
                  type="button"
                  className="plat-settings__save profile-action-btn"
                  disabled={busy}
                  onClick={onStartEnrollment}
                >
                  Continue setup
                </button>
              ) : (
                <button
                  type="button"
                  className="plat-settings__save profile-action-btn"
                  disabled={busy}
                  onClick={onStartEnrollment}
                >
                  Set up
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
      <h2>Authenticator</h2>
      <p className="settings-mfa-status" role="status">
        Status:{" "}
        <strong className={enrolled ? "ok" : ""}>
          {enrolled
            ? "Enabled"
            : enrollmentPending
              ? "Pending"
              : "Not enrolled"}
        </strong>
      </p>
      {!canEnroll ? (
        <p className="muted">Not available for this role.</p>
      ) : enrolled ? null : enrollmentPending ? (
        <button type="button" className="btn-primary" onClick={onStartEnrollment}>
          Continue setup
        </button>
      ) : (
        <button type="button" className="btn-primary" onClick={onStartEnrollment}>
          Set up authenticator
        </button>
      )}
      <AuthToast message={ok} tone="ok" onDismiss={() => setOk(null)} />
    </div>
  );
}
