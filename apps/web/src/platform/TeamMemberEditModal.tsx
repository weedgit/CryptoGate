import { FormEvent, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "../auth/AuthToast";
import { DefaultUserAvatar } from "../auth/DefaultUserAvatar";
import { ApiError, patchOrgMember, type OrgMember } from "./api";
import { readOrgIconFile } from "../shared/orgBrand";
import { formatPhoneInput } from "../shared/phoneFormat";
import { FieldControl } from "../ui/FieldControl";
import { SearchableSelect } from "../ui/SearchableSelect";

type Props = {
  orgId: string;
  member: OrgMember;
  roleOptions: { id: string; label: string }[];
  roleLocked: boolean;
  /** Platform Owner/Administrator support: email, phone, password, verification. */
  platformSupport: boolean;
  onClose: () => void;
  onSaved: (next: OrgMember) => void;
};


function HeadPencil() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M13.5 6.5 17.5 10.5" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
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

function RoleGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="2.6" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M4.2 17.5c.6-2.4 2.3-3.6 4.8-3.6 1.2 0 2.2.3 3 .8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M14.2 11.2h6.2v5.2l-3.1 1.6-3.1-1.6v-5.2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
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

function CircleGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function VerifyCard({
  icon,
  title,
  verified,
  disabled,
  onToggle,
}: {
  icon: ReactNode;
  title: string;
  verified: boolean;
  disabled: boolean;
  onToggle?: () => void;
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
          {verified ? "Verified" : "Not verified"}
        </span>
      </div>
      {onToggle ? (
        <button
          type="button"
          className={`owner-acct__verify-btn${verified ? "" : " is-mark"}`}
          disabled={disabled}
          onClick={onToggle}
        >
          {verified ? <CircleGlyph /> : <CheckGlyph />}
          {verified ? "Mark not verified" : "Mark verified"}
        </button>
      ) : null}
    </div>
  );
}

export function TeamMemberEditModal({
  orgId,
  member,
  roleOptions,
  roleLocked,
  platformSupport,
  onClose,
  onSaved,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [firstName, setFirstName] = useState(member.firstName ?? "");
  const [lastName, setLastName] = useState(member.lastName ?? "");
  const [email, setEmail] = useState(member.email);
  const [phone, setPhone] = useState(formatPhoneInput(member.phone ?? ""));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(member.avatarUrl ?? null);
  const [role, setRole] = useState(member.role);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [emailVerified, setEmailVerified] = useState(member.emailVerified === true);
  const [phoneVerified, setPhoneVerified] = useState(member.phoneVerified === true);
  const [busy, setBusy] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(member.firstName ?? "");
    setLastName(member.lastName ?? "");
    setEmail(member.email);
    setPhone(formatPhoneInput(member.phone ?? ""));
    setAvatarUrl(member.avatarUrl ?? null);
    setRole(member.role);
    setPassword("");
    setPasswordConfirm("");
    setShowPassword(false);
    setShowPasswordConfirm(false);
    setError(null);
  }, [
    member.userId,
    member.firstName,
    member.lastName,
    member.email,
    member.phone,
    member.avatarUrl,
    member.role,
  ]);

  useEffect(() => {
    setEmailVerified(member.emailVerified === true);
    setPhoneVerified(member.phoneVerified === true);
  }, [member.emailVerified, member.phoneVerified]);

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

  function toggleVerified(field: "emailVerified" | "phoneVerified") {
    if (busy) return;
    if (field === "emailVerified") setEmailVerified((v) => !v);
    else setPhoneVerified((v) => !v);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || readingFile) return;
    const nextEmail = email.trim();
    if (!nextEmail.includes("@")) {
      setError("A valid email is required");
      return;
    }
    if (password || passwordConfirm) {
      if (password !== passwordConfirm) {
        setError("Passwords do not match");
        return;
      }
      if (password.length < 12) {
        setError("Password must be at least 12 characters");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const next = await patchOrgMember(orgId, member.userId, {
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        avatarUrl,
        role: roleLocked ? member.role : role,
        ...(platformSupport
          ? {
              email: nextEmail,
              phone: phone.trim() || null,
              ...(password ? { password } : {}),
              ...(emailVerified !== (member.emailVerified === true) ? { emailVerified } : {}),
              ...(phoneVerified !== (member.phoneVerified === true) ? { phoneVerified } : {}),
            }
          : {}),
      });
      onSaved({ ...member, ...next });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update member");
    } finally {
      setBusy(false);
    }
  }

  const saving = busy || readingFile;

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
        aria-label="Edit member"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="org-edit__head">
          <span className="org-edit__head-icon" aria-hidden>
            <HeadPencil />
          </span>
          <div className="org-edit__head-copy">
            <h3 className="org-edit__title">Edit member</h3>
            <p className="org-edit__subtitle">Update member details and account settings.</p>
          </div>
          <div className="org-edit__waves" aria-hidden>
            <svg viewBox="0 0 640 120" preserveAspectRatio="none">
              <defs>
                <linearGradient id="member-edit-gold-a" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" style={{ stopColor: "rgb(var(--gw-base, 255 208 96))" }} stopOpacity="0" />
                  <stop offset="0.35" style={{ stopColor: "rgb(var(--gw-base, 255 208 96))" }} stopOpacity="0.9" />
                  <stop offset="1" style={{ stopColor: "rgb(var(--gw-base, 255 208 96))" }} stopOpacity="0" />
                </linearGradient>
                <linearGradient id="member-edit-gold-b" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" style={{ stopColor: "rgb(var(--gw-deep, 255 193 69))" }} stopOpacity="0" />
                  <stop offset="0.5" style={{ stopColor: "rgb(var(--gw-deep, 255 193 69))" }} stopOpacity="0.7" />
                  <stop offset="1" style={{ stopColor: "rgb(var(--gw-deep, 255 193 69))" }} stopOpacity="0" />
                </linearGradient>
                <linearGradient id="member-edit-gold-c" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" style={{ stopColor: "rgb(var(--gw-hi, 255 224 138))" }} stopOpacity="0" />
                  <stop offset="0.6" style={{ stopColor: "rgb(var(--gw-hi, 255 224 138))" }} stopOpacity="0.55" />
                  <stop offset="1" style={{ stopColor: "rgb(var(--gw-hi, 255 224 138))" }} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M80 62 C 180 58, 240 30, 340 36 C 430 42, 500 56, 580 50"
                fill="none"
                stroke="url(#member-edit-gold-a)"
                strokeWidth="1.55"
                strokeLinecap="round"
              />
              <path
                d="M100 74 C 200 70, 260 46, 360 50 C 450 54, 510 66, 570 62"
                fill="none"
                stroke="url(#member-edit-gold-b)"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.95"
              />
              <path
                d="M120 50 C 210 46, 270 68, 370 62 C 460 56, 520 40, 590 44"
                fill="none"
                stroke="url(#member-edit-gold-c)"
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
                    <p>Verification settings</p>
                    <small>
                      {platformSupport
                        ? "Platform Owner or Administrator can directly update verification status."
                        : "Members verify email and phone from their own profile."}
                    </small>
                  </div>
                </div>
                <VerifyCard
                  icon={<MailGlyph />}
                  title="Email verification"
                  verified={emailVerified}
                  disabled={saving}
                  onToggle={platformSupport ? () => toggleVerified("emailVerified") : undefined}
                />
                <VerifyCard
                  icon={<PhoneGlyph />}
                  title="Phone verification"
                  verified={phoneVerified}
                  disabled={saving || !phone.trim()}
                  onToggle={platformSupport ? () => toggleVerified("phoneVerified") : undefined}
                />
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
                    autoFocus
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
                    readOnly={!platformSupport}
                    placeholder="name@company.com"
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
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
                    readOnly={!platformSupport}
                    placeholder={platformSupport ? "+1 (555) 123-4567" : "Not set"}
                    onChange={(e) => setPhone(formatPhoneInput(e.target.value, phone))}
                    autoComplete="tel"
                    inputMode="tel"
                  />
                </FieldControl>
              </label>
              {!platformSupport ? (
                <p className="owner-acct__locked-note owner-acct__field--wide">
                  Email, phone, and password are managed by the member. They change
                  their own contact from their profile and use Forgot password to reset
                  it.
                </p>
              ) : null}
              <div className="owner-acct__field owner-acct__field--wide">
                <span className="owner-acct__label">Business time zone</span>
                <FieldControl leading={<ClockGlyph />}>
                  <input
                    className="field-control"
                    value="Uses the organization business time zone"
                    readOnly
                    disabled
                    aria-label="Business time zone"
                  />
                </FieldControl>
              </div>
              <div className="owner-acct__field owner-acct__field--wide">
                <span className="owner-acct__label">Role</span>
                <FieldControl leading={<RoleGlyph />}>
                  <SearchableSelect
                    value={role}
                    options={roleOptions}
                    disabled={saving || roleLocked}
                    allowEmpty={false}
                    ariaLabel="Member role"
                    onChange={setRole}
                  />
                </FieldControl>
              </div>
              {platformSupport ? (
              <>
              <label className="owner-acct__field owner-acct__field--wide">
                <span className="owner-acct__label">New password</span>
                <FieldControl
                  leading={<LockGlyph />}
                  showPassword={showPassword}
                  onTogglePassword={() => setShowPassword((v) => !v)}
                  toggleDisabled={saving}
                >
                  <input
                    className="field-control"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    maxLength={128}
                    disabled={saving}
                    autoComplete="new-password"
                    placeholder="Leave blank to keep current"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </FieldControl>
              </label>
              <label className="owner-acct__field owner-acct__field--wide">
                <span className="owner-acct__label">Confirm new password</span>
                <FieldControl
                  leading={<LockGlyph />}
                  showPassword={showPasswordConfirm}
                  onTogglePassword={() => setShowPasswordConfirm((v) => !v)}
                  toggleDisabled={saving}
                >
                  <input
                    className="field-control"
                    type={showPasswordConfirm ? "text" : "password"}
                    value={passwordConfirm}
                    maxLength={128}
                    disabled={saving}
                    autoComplete="new-password"
                    placeholder="Confirm new password"
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                  />
                </FieldControl>
              </label>
              </>
              ) : null}
            </div>
          </div>
          <footer className="owner-acct__foot">
            <button type="button" className="org-edit__cancel" disabled={saving} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="owner-acct__save" disabled={saving || !email.trim()}>
              <SaveGlyph />
              {busy ? "Saving…" : "Save"}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
