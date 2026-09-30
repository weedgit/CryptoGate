import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { browserTimeZone } from "../shared/dateTime";
import { timeZoneSelectOptions } from "../shared/timeZoneOptions";
import { createPortal } from "react-dom";
import {
  ApiError,
  changePassword,
  getSession,
  resetMfa,
  sendEmailOtp,
  sendPhoneOtp,
  updateProfile,
  verifyEmailOtp,
  verifyPhoneOtp,
  type Session,
} from "../merchant/api";
import { readOrgIconFile } from "../shared/orgBrand";
import { formatPhoneInput } from "../shared/phoneFormat";
import { showToast } from "../shared/toast";
import { FieldControl } from "../ui/FieldControl";
import { SearchableSelect } from "../ui/SearchableSelect";
import { AuthToast } from "./AuthToast";
import { ContactOtpModal } from "./ContactOtpModal";
import { DefaultUserAvatar } from "./DefaultUserAvatar";
import { MfaEnrollmentWizard } from "./MfaEnrollmentWizard";
import { sessionCanEnrollMfa } from "./mfaSession";
import { evaluatePasswordPolicy } from "./passwordPolicy";
import { sessionHasAvatar } from "./profileIdentity";

type Props = {
  session: Session;
  title?: string;
  onClose: () => void;
  onSessionRefresh?: (session: Session) => void;
  /** Extra full-width section below the form (e.g. portal notifications). */
  extraSection?: ReactNode;
  /** Open straight into authenticator setup (when the user can enroll). */
  startMfa?: boolean;
};


/** Unconfirmed profiles still hold the UTC default; start from the device zone instead. */
function profileTimeZoneDefault(session: Session): string {
  if (session.timezoneConfirmed === true && session.timezone) return session.timezone;
  return browserTimeZone();
}

function HeadUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M5.5 19.2c1-3 3.2-4.5 6.5-4.5s5.5 1.5 6.5 4.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UserGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M5.5 19.2c1-3 3.2-4.5 6.5-4.5s5.5 1.5 6.5 4.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MailGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="m5 8 7 5 7-5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PhoneGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 4.5h2.2l1.2 3-1.7.9a9 9 0 0 0 4.9 4.9l.9-1.7 3 1.2V15a2 2 0 0 1-2.2 2A12.5 12.5 0 0 1 5 7.7 2 2 0 0 1 7 5.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 8.5V12l2.5 1.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="6" y="10.5" width="12" height="8.5" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function UploadGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 16V6M8 9.5 12 5.5l4 4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CameraGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 7.5 9.2 6h5.6L16 7.5h2.2A1.8 1.8 0 0 1 20 9.3v7.2a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 16.5V9.3A1.8 1.8 0 0 1 5.8 7.5H8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.2" r="2.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function ShieldGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5 19 6.2v5.4c0 4.2-2.8 7.2-7 8.9-4.2-1.7-7-4.7-7-8.9V6.2L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="m8.8 12 2.1 2.1 4.3-4.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SaveGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 5.5A1.5 1.5 0 0 1 6.5 4h9.2L19.5 7.8V18.5A1.5 1.5 0 0 1 18 20H6.5A1.5 1.5 0 0 1 5 18.5v-13Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8 4.5V9h6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 20v-5.2h8V20" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="m3.5 8.2 2.8 2.8 6.2-6.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type OtpPending = {
  channel: "email" | "phone";
  destination: string;
  pendingChange: boolean;
  initialCode?: string;
};

function ActionCard({
  icon,
  title,
  verified,
  statusLabel,
  actionLabel,
  busy,
  disabled,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  verified: boolean;
  statusLabel: string;
  actionLabel: string;
  busy: boolean;
  disabled: boolean;
  onAction: () => void;
}) {
  return (
    <div className="owner-acct__verify-card">
      <div className="owner-acct__verify-row">
        <span className="owner-acct__verify-icon" aria-hidden>
          {icon}
        </span>
        <span>{title}</span>
        <span className={`owner-acct__badge${verified ? " is-verified" : " is-pending"}`}>
          {verified ? <CheckGlyph /> : <span className="owner-acct__badge-mark" aria-hidden>!</span>}
          {statusLabel}
        </span>
      </div>
      <button
        type="button"
        className={`owner-acct__verify-btn${verified ? "" : " is-mark"}`}
        disabled={disabled}
        onClick={onAction}
      >
        {busy ? "Working…" : actionLabel}
      </button>
    </div>
  );
}

/**
 * Self Profile modal — same shell as Edit member (org-edit + owner-acct).
 */
export function ProfileSettingsModal({
  session,
  title = "Profile",
  onClose,
  onSessionRefresh,
  extraSection,
  startMfa = false,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [live, setLive] = useState(session);
  const [firstName, setFirstName] = useState(session.firstName ?? "");
  const [lastName, setLastName] = useState(session.lastName ?? "");
  const [email, setEmail] = useState(session.email);
  const [phone, setPhone] = useState(formatPhoneInput(session.phone ?? ""));
  const [timezone, setTimezone] = useState(() => profileTimeZoneDefault(session));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    sessionHasAvatar(session) ? (session.avatarUrl ?? null) : null,
  );
  const [currentPassword, setCurrentPassword] = useState("");
  /** Read-only until focused so browsers / password managers don't autofill it. */
  const [currentPasswordArmed, setCurrentPasswordArmed] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [contactBusy, setContactBusy] = useState<"email" | "phone" | "mfa" | null>(null);
  const [otpModal, setOtpModal] = useState<OtpPending | null>(null);
  const [mfaWizard, setMfaWizard] = useState(
    () => startMfa && sessionCanEnrollMfa(session) && session.mfaEnrolled !== true,
  );
  const [mfaReplaceOpen, setMfaReplaceOpen] = useState(false);
  const [mfaReplacePassword, setMfaReplacePassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const closeAfterPhoneVerifyRef = useRef(false);

  useEffect(() => {
    setLive(session);
    setFirstName(session.firstName ?? "");
    setLastName(session.lastName ?? "");
    setEmail(session.email);
    setPhone(formatPhoneInput(session.phone ?? ""));
    setTimezone(profileTimeZoneDefault(session));
    setAvatarUrl(sessionHasAvatar(session) ? (session.avatarUrl ?? null) : null);
  }, [
    session.userId,
    session.firstName,
    session.lastName,
    session.email,
    session.phone,
    session.timezone,
    session.timezoneConfirmed,
    session.avatarUrl,
    session.emailVerified,
    session.phoneVerified,
    session.mfaEnrolled,
    session.mfaEnrollmentPending,
  ]);

  const canEnroll = sessionCanEnrollMfa(live);
  const enrolled = live.mfaEnrolled === true;
  const enrollmentPending = live.mfaEnrollmentPending === true;
  const emailVerified =
    live.emailVerified === true &&
    email.trim().toLowerCase() === live.email.toLowerCase();
  const phoneVerified =
    live.phoneVerified === true &&
    formatPhoneInput(phone) === formatPhoneInput(live.phone ?? "");

  const timezoneOptions = useMemo(() => timeZoneSelectOptions(timezone.trim() || "UTC"), [timezone]);

  const passwordPolicy = evaluatePasswordPolicy(newPassword);
  const saving = busy || readingFile;

  function applySession(next: Session) {
    setLive(next);
    onSessionRefresh?.(next);
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setReadingFile(true);
    try {
      setAvatarUrl(await readOrgIconFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not use that image");
    } finally {
      setReadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function sendContact(channel: "email" | "phone", phoneValue: string = phone) {
    if (contactBusy) return;
    setContactBusy(channel);
    setError(null);
    setOk(null);
    try {
      if (channel === "email") {
        const next = email.trim().toLowerCase();
        if (!next.includes("@")) {
          setError("Enter a valid email address");
          return;
        }
        const result = await sendEmailOtp(next);
        if (result.session) applySession(result.session);
        if (result.status === "already_verified") {
          setOk("Email already verified.");
          return;
        }
        const destination = result.email ?? next;
        setEmail(destination);
        setOtpModal({
          channel: "email",
          destination,
          pendingChange: result.pendingChange === true,
          initialCode: result.devCode,
        });
      } else {
        const normalized = phoneValue.trim();
        if (normalized.length < 8) {
          setError("Enter a valid mobile number with country code");
          return;
        }
        const result = await sendPhoneOtp(normalized);
        if (result.session) applySession(result.session);
        if (result.status === "already_verified") {
          setOk("Phone already verified.");
          return;
        }
        const destination = result.phone ?? normalized;
        setPhone(formatPhoneInput(destination));
        setOtpModal({
          channel: "phone",
          destination,
          pendingChange: result.pendingChange === true,
          initialCode: result.devCode,
        });
        return true;
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send code");
    } finally {
      setContactBusy(null);
    }
    return false;
  }

  async function onMfaAction() {
    if (!canEnroll || contactBusy) return;
    if (enrolled) {
      setMfaReplaceOpen(true);
      setError(null);
      return;
    }
    setMfaWizard(true);
  }

  async function onConfirmMfaReset() {
    if (!mfaReplacePassword.trim() || contactBusy) return;
    setContactBusy("mfa");
    setError(null);
    try {
      const next = await resetMfa(mfaReplacePassword);
      applySession(next);
      setMfaReplaceOpen(false);
      setMfaReplacePassword("");
      setMfaWizard(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset authenticator");
    } finally {
      setContactBusy(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const typedPhone = phone.trim();
    const phoneChanged =
      typedPhone !== "" && formatPhoneInput(typedPhone) !== formatPhoneInput(live.phone ?? "");
    let verifyPhoneAfter = false;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      let next = await updateProfile({
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        avatarUrl,
        timezone: timezone.trim() || "UTC",
      });
      applySession(next);

      if (newPassword || confirmPassword) {
        if (!currentPassword) {
          setError("Enter your current password");
          return;
        }
        if (newPassword !== confirmPassword) {
          setError("Passwords do not match");
          return;
        }
        if (!passwordPolicy.valid) {
          setError("New password does not meet requirements");
          return;
        }
        next = await changePassword({
          currentPassword,
          newPassword,
        });
        applySession(next);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }

      if (phoneChanged) {
        verifyPhoneAfter = true;
      } else {
        showToast("Profile saved.", { tone: "ok" });
        onClose();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
    if (verifyPhoneAfter) {
      setPhone(formatPhoneInput(typedPhone));
      if (await sendContact("phone", typedPhone)) {
        closeAfterPhoneVerifyRef.current = true;
        setOk("Profile saved. Verify the new phone number to finish changing it.");
      }
    }
  }

  const mfaPopup = mfaWizard ? (
    <MfaEnrollmentWizard
      variant="modal"
      onCancel={() => setMfaWizard(false)}
      onComplete={() => {
        void getSession().then((next) => {
          applySession(next);
          setMfaWizard(false);
          setOk("Authenticator enabled.");
        });
      }}
    />
  ) : null;

  return createPortal(
    <div
      className="b3-commission-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="b3-commission-modal b3-owner-edit org-profile-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="org-edit__head">
          <span className="org-edit__head-icon" aria-hidden>
            <HeadUser />
          </span>
          <div className="org-edit__head-copy">
            <h3 className="org-edit__title">{title}</h3>
            <p className="org-edit__subtitle">Update your details and sign-in security.</p>
          </div>
          <div className="org-edit__waves" aria-hidden>
            <svg viewBox="0 0 640 120" preserveAspectRatio="none">
              <defs>
                <linearGradient id="profile-edit-gold-a" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" style={{ stopColor: "rgb(var(--gw-base, 255 208 96))" }} stopOpacity="0" />
                  <stop offset="0.35" style={{ stopColor: "rgb(var(--gw-base, 255 208 96))" }} stopOpacity="0.9" />
                  <stop offset="1" style={{ stopColor: "rgb(var(--gw-base, 255 208 96))" }} stopOpacity="0" />
                </linearGradient>
                <linearGradient id="profile-edit-gold-b" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" style={{ stopColor: "rgb(var(--gw-deep, 255 193 69))" }} stopOpacity="0" />
                  <stop offset="0.5" style={{ stopColor: "rgb(var(--gw-deep, 255 193 69))" }} stopOpacity="0.7" />
                  <stop offset="1" style={{ stopColor: "rgb(var(--gw-deep, 255 193 69))" }} stopOpacity="0" />
                </linearGradient>
                <linearGradient id="profile-edit-gold-c" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" style={{ stopColor: "rgb(var(--gw-hi, 255 224 138))" }} stopOpacity="0" />
                  <stop offset="0.6" style={{ stopColor: "rgb(var(--gw-hi, 255 224 138))" }} stopOpacity="0.55" />
                  <stop offset="1" style={{ stopColor: "rgb(var(--gw-hi, 255 224 138))" }} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M80 62 C 180 58, 240 30, 340 36 C 430 42, 500 56, 580 50"
                fill="none"
                stroke="url(#profile-edit-gold-a)"
                strokeWidth="1.55"
                strokeLinecap="round"
              />
              <path
                d="M100 74 C 200 70, 260 46, 360 50 C 450 54, 510 66, 570 62"
                fill="none"
                stroke="url(#profile-edit-gold-b)"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.95"
              />
              <path
                d="M120 50 C 210 46, 270 68, 370 62 C 460 56, 520 40, 590 44"
                fill="none"
                stroke="url(#profile-edit-gold-c)"
                strokeWidth="1"
                strokeLinecap="round"
                opacity="0.8"
              />
            </svg>
          </div>
          <button
            type="button"
            className="org-edit__close"
            aria-label="Close"
            disabled={saving}
            onClick={onClose}
          >
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <form className="owner-acct" onSubmit={(e) => void onSubmit(e)}>
          <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
          {ok ? (
            <AuthToast message={ok} tone="ok" onDismiss={() => setOk(null)} />
          ) : null}

          <div className="owner-acct__layout">
            <aside className="owner-acct__side">
              <div className="owner-acct__avatar">
                <span className="owner-acct__photo" aria-hidden>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" />
                  ) : (
                    <DefaultUserAvatar className="owner-acct__photo-default" />
                  )}
                </span>
                <button
                  type="button"
                  className="owner-acct__camera"
                  aria-label="Upload photo"
                  disabled={saving}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <CameraGlyph />
                </button>
              </div>
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
                className="org-edit__choose"
                disabled={saving}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadGlyph />
                {readingFile ? "Reading…" : "Upload photo"}
              </button>
              <p className="org-edit__file-hint">JPG, PNG up to 4MB</p>

              <div className="owner-acct__verify">
                <div className="owner-acct__verify-head">
                  <ShieldGlyph />
                  <div>
                    <p>Security</p>
                    <small>Verify contact and manage authenticator.</small>
                  </div>
                </div>
                <ActionCard
                  icon={<MailGlyph />}
                  title="Email"
                  verified={emailVerified}
                  statusLabel={emailVerified ? "Verified" : "Not verified"}
                  actionLabel={
                    emailVerified
                      ? "Update"
                      : contactBusy === "email"
                        ? "Sending…"
                        : "Verify email"
                  }
                  busy={contactBusy === "email"}
                  disabled={saving || contactBusy === "email"}
                  onAction={() => void sendContact("email")}
                />
                <ActionCard
                  icon={<PhoneGlyph />}
                  title="Phone"
                  verified={phoneVerified}
                  statusLabel={phoneVerified ? "Verified" : "Not verified"}
                  actionLabel={
                    phoneVerified
                      ? "Update"
                      : contactBusy === "phone"
                        ? "Sending…"
                        : "Verify phone"
                  }
                  busy={contactBusy === "phone"}
                  disabled={saving || contactBusy === "phone"}
                  onAction={() => void sendContact("phone")}
                />
                {canEnroll ? (
                  <ActionCard
                    icon={<ShieldGlyph />}
                    title="Authenticator"
                    verified={enrolled}
                    statusLabel={
                      enrolled ? "Enabled" : enrollmentPending ? "Pending" : "Off"
                    }
                    actionLabel={
                      enrolled
                        ? "Change"
                        : enrollmentPending
                          ? "Continue"
                          : "Set up"
                    }
                    busy={contactBusy === "mfa"}
                    disabled={saving || contactBusy === "mfa"}
                    onAction={() => void onMfaAction()}
                  />
                ) : null}
                {mfaReplaceOpen ? (
                  <div className="owner-acct__verify-card profile-mfa-inline">
                    <label className="owner-acct__field" style={{ margin: 0, width: "100%" }}>
                      <span className="owner-acct__label">Current password</span>
                      <FieldControl
                        leading={<LockGlyph />}
                        showPassword={showCurrent}
                        onTogglePassword={() => setShowCurrent((v) => !v)}
                        toggleDisabled={saving}
                      >
                        <input
                          className="field-control"
                          type={showCurrent ? "text" : "password"}
                          value={mfaReplacePassword}
                          disabled={saving || contactBusy === "mfa"}
                          autoComplete="current-password"
                          onChange={(e) => setMfaReplacePassword(e.target.value)}
                        />
                      </FieldControl>
                    </label>
                    <div className="profile-mfa-replace__actions">
                      <button
                        type="button"
                        className="org-edit__cancel"
                        disabled={saving || contactBusy === "mfa"}
                        onClick={() => {
                          setMfaReplaceOpen(false);
                          setMfaReplacePassword("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="owner-acct__verify-btn is-mark"
                        disabled={
                          saving ||
                          contactBusy === "mfa" ||
                          !mfaReplacePassword.trim()
                        }
                        onClick={() => void onConfirmMfaReset()}
                      >
                        {contactBusy === "mfa" ? "Resetting…" : "Confirm reset"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </aside>

            <div className="owner-acct__form">
              <label className="owner-acct__field">
                <span className="owner-acct__label">First name</span>
                <FieldControl leading={<UserGlyph />}>
                  <input
                    className="field-control"
                    value={firstName}
                    maxLength={80}
                    disabled={saving}
                    placeholder="Enter first name"
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                  />
                </FieldControl>
              </label>
              <label className="owner-acct__field">
                <span className="owner-acct__label">Last name</span>
                <FieldControl leading={<UserGlyph />}>
                  <input
                    className="field-control"
                    value={lastName}
                    maxLength={80}
                    disabled={saving}
                    placeholder="Enter last name"
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                  />
                </FieldControl>
              </label>
              <label className="owner-acct__field owner-acct__field--wide">
                <span className="owner-acct__label">Email</span>
                <FieldControl leading={<MailGlyph />}>
                  <input
                    className="field-control"
                    type="email"
                    value={email}
                    maxLength={254}
                    disabled={saving}
                    placeholder="name@company.com"
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </FieldControl>
              </label>
              <label className="owner-acct__field owner-acct__field--wide">
                <span className="owner-acct__label">Phone</span>
                <FieldControl leading={<PhoneGlyph />}>
                  <input
                    className="field-control"
                    value={phone}
                    maxLength={24}
                    disabled={saving}
                    placeholder="+1 (555) 123-4567"
                    onChange={(e) => setPhone(formatPhoneInput(e.target.value, phone))}
                    autoComplete="tel"
                    inputMode="tel"
                  />
                </FieldControl>
              </label>
              <div className="owner-acct__field owner-acct__field--wide">
                <span className="owner-acct__label">Timezone</span>
                <FieldControl leading={<ClockGlyph />}>
                  <SearchableSelect
                    value={timezone}
                    options={timezoneOptions}
                    allowEmpty={false}
                    disabled={saving}
                    ariaLabel="Timezone"
                    onChange={setTimezone}
                  />
                </FieldControl>
              </div>
              <label className="owner-acct__field owner-acct__field--wide">
                <span className="owner-acct__label">Current password</span>
                <FieldControl
                  leading={<LockGlyph />}
                  showPassword={showCurrent}
                  onTogglePassword={() => setShowCurrent((v) => !v)}
                  toggleDisabled={saving}
                >
                  <input
                    className="field-control"
                    type={showCurrent ? "text" : "password"}
                    name="profile-current-password"
                    value={currentPassword}
                    disabled={saving}
                    readOnly={!currentPasswordArmed}
                    onFocus={() => setCurrentPasswordArmed(true)}
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    placeholder="Required to change password"
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </FieldControl>
              </label>
              <label className="owner-acct__field">
                <span className="owner-acct__label">New password</span>
                <FieldControl
                  leading={<LockGlyph />}
                  showPassword={showNew}
                  onTogglePassword={() => setShowNew((v) => !v)}
                  toggleDisabled={saving}
                >
                  <input
                    className="field-control"
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    maxLength={128}
                    disabled={saving}
                    autoComplete="new-password"
                    placeholder="Leave blank to keep"
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </FieldControl>
              </label>
              <label className="owner-acct__field">
                <span className="owner-acct__label">Confirm password</span>
                <FieldControl
                  leading={<LockGlyph />}
                  showPassword={showConfirm}
                  onTogglePassword={() => setShowConfirm((v) => !v)}
                  toggleDisabled={saving}
                >
                  <input
                    className="field-control"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    maxLength={128}
                    disabled={saving}
                    autoComplete="new-password"
                    placeholder="Confirm new password"
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </FieldControl>
              </label>
            </div>
          </div>

          {extraSection}

          <footer className="owner-acct__foot">
            <button
              type="button"
              className="org-edit__cancel"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="owner-acct__save" disabled={saving}>
              <SaveGlyph />
              {busy ? "Saving…" : "Save"}
            </button>
          </footer>
        </form>
      </div>

      {otpModal != null ? (
        <ContactOtpModal
          key={`${otpModal.channel}:${otpModal.destination}:${otpModal.initialCode ?? ""}`}
          channel={otpModal.channel}
          destination={otpModal.destination}
          pendingChange={otpModal.pendingChange}
          initialCode={otpModal.initialCode}
          onClose={() => {
            closeAfterPhoneVerifyRef.current = false;
            setOtpModal(null);
          }}
          onVerify={async (code) => {
            try {
              if (otpModal.channel === "email") {
                applySession(await verifyEmailOtp(code));
                setOk("Email verified.");
              } else {
                applySession(await verifyPhoneOtp(code));
                if (closeAfterPhoneVerifyRef.current) {
                  closeAfterPhoneVerifyRef.current = false;
                  showToast("Profile saved. Phone verified.", { tone: "ok" });
                  onClose();
                  return;
                }
                setOk("Phone verified.");
              }
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
                if (result.session) applySession(result.session);
                return { code: result.devCode };
              }
              const result = await sendPhoneOtp(otpModal.destination);
              if (result.session) applySession(result.session);
              return { code: result.devCode };
            } catch (err) {
              throw new Error(
                err instanceof ApiError ? err.message : "Could not resend code",
              );
            }
          }}
        />
      ) : null}
      {mfaPopup}
    </div>,
    document.body,
  );
}
