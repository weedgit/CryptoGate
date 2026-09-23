import { FormEvent, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "../auth/AuthToast";
import { DefaultUserAvatar } from "../auth/DefaultUserAvatar";
import { CopyGlyph } from "./CopyGlyph";
import { readOrgIconFile } from "./orgBrand";
import { formatPhoneDisplay, formatPhoneInput } from "./phoneFormat";
import { FieldControl } from "../ui/FieldControl";
import { SearchableSelect } from "../ui/SearchableSelect";
import {
  ApiError,
  patchOrgOwnerProfile,
  putOrgOwnerVerification,
  type OrgPrimaryOwnerContact,
} from "../platform/api";

type Props = {
  orgId: string;
  owner: OrgPrimaryOwnerContact | null;
  loading?: boolean;
  /** Platform Owner only — show support edit / verification override. */
  canSupportEdit: boolean;
  onOwnerUpdated: (next: OrgPrimaryOwnerContact) => void;
  /**
   * When true, wrap fields in an Owner section with header + Edit.
   * When false, render fields only (parent supplies section chrome).
   */
  asSection?: boolean;
};

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 12.5h2.8L12.8 5.5 10.5 3.2 3 10.7v1.8Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M8.8 4l2.8 2.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ownerDisplayName(owner: OrgPrimaryOwnerContact | null): string {
  if (!owner) return "—";
  const first = (owner.firstName ?? "").trim();
  const last = (owner.lastName ?? "").trim();
  if (first || last) return [first, last].filter(Boolean).join(" ");
  return "—";
}

function VerificationBadge({ verified, label }: { verified: boolean; label: string }) {
  return (
    <span
      className={`b3-profile__verify${verified ? " is-verified" : " is-pending"}`}
      title={verified ? `${label} verified` : `${label} not verified`}
    >
      {verified ? "Verified" : "Not verified"}
    </span>
  );
}

function dash(value: string | null | undefined, loading: boolean): string {
  if (loading) return "…";
  const t = value?.trim();
  return t ? t : "—";
}

function CopyContactButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className={`cg-copy-btn b3-profile__copy-icon${copied ? " is-copied" : ""}`}
      onClick={() => void copy()}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? "Copied" : "Copy"}
    >
      <CopyGlyph copied={copied} />
    </button>
  );
}

/**
 * Owner contact fields + Platform Owner support edit / verification override.
 */
export function OrgOwnerSupportFields({
  orgId,
  owner,
  loading = false,
  canSupportEdit,
  onOwnerUpdated,
  asSection = false,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);

  const fields = (
    <>
      <div className="b3-profile__field">
        <p className="b3-profile__label">First name</p>
        <p className="b3-profile__value">
          {dash(owner?.firstName, loading)}
        </p>
      </div>
      <div className="b3-profile__field">
        <p className="b3-profile__label">Last name</p>
        <p className="b3-profile__value">
          {dash(owner?.lastName, loading)}
        </p>
      </div>
      {!asSection ? (
        <div className="b3-profile__field">
          <p className="b3-profile__label">Full name</p>
          <div className="b3-profile__value-row">
            <p className="b3-profile__value">
              {loading ? "…" : ownerDisplayName(owner)}
            </p>
            {canSupportEdit && owner ? (
              <button
                type="button"
                className="b3-profile__edit-btn"
                onClick={() => setEditOpen(true)}
              >
                Edit
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="b3-profile__field">
        <p className="b3-profile__label">Email</p>
        <div className="b3-profile__contact">
          <span className="b3-profile__value-with-copy">
            <p className="b3-profile__value">{dash(owner?.email, loading)}</p>
            {owner?.email?.trim() ? (
              <CopyContactButton value={owner.email.trim()} label="email" />
            ) : null}
          </span>
          {owner ? (
            <VerificationBadge verified={owner.emailVerified} label="Email" />
          ) : null}
        </div>
      </div>
      <div className="b3-profile__field">
        <p className="b3-profile__label">Phone</p>
        <div className="b3-profile__contact">
          <span className="b3-profile__value-with-copy">
            <p className="b3-profile__value">
              {dash(owner?.phone ? formatPhoneDisplay(owner.phone) : owner?.phone, loading)}
            </p>
            {owner?.phone?.trim() ? (
              <CopyContactButton value={formatPhoneDisplay(owner.phone)} label="phone" />
            ) : null}
          </span>
          {owner?.phone ? (
            <VerificationBadge verified={owner.phoneVerified} label="Phone" />
          ) : null}
        </div>
      </div>
      <div className="b3-profile__field">
        <p className="b3-profile__label">Timezone</p>
        <p className="b3-profile__value">{dash(owner?.timezone, loading)}</p>
      </div>
      {editOpen && owner ? (
        <OwnerProfileEditModal
          orgId={orgId}
          owner={owner}
          onClose={() => setEditOpen(false)}
          onSaved={(next) => {
            onOwnerUpdated({ ...owner, ...next });
            setEditOpen(false);
          }}
          onVerified={(next) => onOwnerUpdated({ ...owner, ...next })}
        />
      ) : null}
    </>
  );

  if (!asSection) return fields;

  return (
    <section className="b3-card b3-card--section b3-card--flat" aria-label="Owner">
      <div className="b3-profile__head">
        <span className="b3-profile__head-icon b3-profile__head-avatar" aria-hidden>
          {owner?.avatarUrl ? (
            <img src={owner.avatarUrl} alt="" />
          ) : (
            <DefaultUserAvatar className="b3-profile__head-avatar-default" />
          )}
        </span>
        <div className="b3-profile__head-copy">
          <div className="b3-profile__title-row">
            <h3 className="b3-card__heading">Owner</h3>
            {owner && typeof owner.mfaEnrolled === "boolean" ? (
              <span className={`b3-profile__mfa${owner.mfaEnrolled ? " is-on" : ""}`}>
                {owner.mfaEnrolled ? "MFA on" : "MFA off"}
              </span>
            ) : null}
          </div>
          <p className="b3-profile__sub">Primary contact information</p>
        </div>
        {canSupportEdit && owner ? (
          <button
            type="button"
            className="b3-profile__edit-btn"
            onClick={() => setEditOpen(true)}
          >
            <PencilIcon />
            Edit
          </button>
        ) : null}
      </div>
      <div className="b3-profile">{fields}</div>
    </section>
  );
}

const OWNER_TIMEZONES = [
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
];

function OwnerHeadPencil() {
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
      <path d="M5.5 19.2c1-3 3.2-4.5 6.5-4.5s5.5 1.5 6.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function MailGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="m5 8 7 5 7-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
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
      <path d="M12 8.5V12l2.5 1.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
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
      <path d="M12 16V6M8 9.5 12 5.5l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CameraGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 7.5 9.2 6h5.6L16 7.5h2.2A1.8 1.8 0 0 1 20 9.3v7.2a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 16.5V9.3A1.8 1.8 0 0 1 5.8 7.5H8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="12.2" r="2.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function ShieldGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3.5 19 6.2v5.4c0 4.2-2.8 7.2-7 8.9-4.2-1.7-7-4.7-7-8.9V6.2L12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m8.8 12 2.1 2.1 4.3-4.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
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
      <path d="m3.5 8.2 2.8 2.8 6.2-6.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
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

function OwnerVerifyCard({
  icon,
  title,
  verified,
  busy,
  disabled,
  onToggle,
}: {
  icon: ReactNode;
  title: string;
  verified: boolean;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
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
      <button
        type="button"
        className={`owner-acct__verify-btn${verified ? "" : " is-mark"}`}
        disabled={disabled}
        onClick={onToggle}
      >
        {verified ? <CircleGlyph /> : <CheckGlyph />}
        {busy ? "Saving…" : verified ? "Mark not verified" : "Mark verified"}
      </button>
    </div>
  );
}

function OwnerProfileEditModal({
  orgId,
  owner,
  onClose,
  onSaved,
  onVerified,
}: {
  orgId: string;
  owner: OrgPrimaryOwnerContact;
  onClose: () => void;
  onSaved: (next: OrgPrimaryOwnerContact) => void;
  onVerified: (next: OrgPrimaryOwnerContact) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [firstName, setFirstName] = useState(owner.firstName ?? "");
  const [lastName, setLastName] = useState(owner.lastName ?? "");
  const [email, setEmail] = useState(owner.email ?? "");
  const [phone, setPhone] = useState(formatPhoneInput(owner.phone ?? ""));
  const [timezone, setTimezone] = useState(owner.timezone || "UTC");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(owner.avatarUrl ?? null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [emailVerified, setEmailVerified] = useState(owner.emailVerified);
  const [phoneVerified, setPhoneVerified] = useState(owner.phoneVerified);
  const [busy, setBusy] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState<"email" | "phone" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(owner.firstName ?? "");
    setLastName(owner.lastName ?? "");
    setEmail(owner.email ?? "");
    setPhone(formatPhoneInput(owner.phone ?? ""));
    setTimezone(owner.timezone || "UTC");
    setAvatarUrl(owner.avatarUrl ?? null);
  }, [owner.firstName, owner.lastName, owner.email, owner.phone, owner.timezone, owner.avatarUrl]);

  useEffect(() => {
    setEmailVerified(owner.emailVerified);
    setPhoneVerified(owner.phoneVerified);
  }, [owner.emailVerified, owner.phoneVerified]);

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

  async function toggleVerified(field: "emailVerified" | "phoneVerified") {
    if (busy || verifyBusy) return;
    const nextValue = field === "emailVerified" ? !emailVerified : !phoneVerified;
    setVerifyBusy(field === "emailVerified" ? "email" : "phone");
    setError(null);
    try {
      const next = await putOrgOwnerVerification(orgId, {
        [field]: nextValue,
      });
      if (field === "emailVerified") setEmailVerified(next.emailVerified);
      else setPhoneVerified(next.phoneVerified);
      onVerified({ ...owner, ...next });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not update verification",
      );
    } finally {
      setVerifyBusy(null);
    }
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
      const next = await patchOrgOwnerProfile(orgId, {
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        email: nextEmail,
        phone: phone.trim() || null,
        timezone: timezone.trim() || "UTC",
        avatarUrl,
        ...(password ? { password } : {}),
      });
      onSaved(next);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not update owner profile",
      );
    } finally {
      setBusy(false);
    }
  }

  const saving = busy || readingFile;
  const timezoneOptions = [
    ...new Set([timezone.trim() || "UTC", ...OWNER_TIMEZONES]),
  ].map((id) => ({ id, label: id }));

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
        aria-label="Edit owner profile"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="org-edit__head">
          <span className="org-edit__head-icon" aria-hidden>
            <OwnerHeadPencil />
          </span>
          <div className="org-edit__head-copy">
            <h3 className="org-edit__title">Edit owner profile</h3>
            <p className="org-edit__subtitle">Update owner details and account settings.</p>
          </div>
          <div className="org-edit__waves" aria-hidden>
            <svg viewBox="0 0 640 120" preserveAspectRatio="none">
              <defs>
                <linearGradient id="owner-edit-gold-a" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#ffd060" stopOpacity="0" />
                  <stop offset="0.35" stopColor="#ffd060" stopOpacity="0.9" />
                  <stop offset="1" stopColor="#ffd060" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="owner-edit-gold-b" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#ffc145" stopOpacity="0" />
                  <stop offset="0.5" stopColor="#ffc145" stopOpacity="0.7" />
                  <stop offset="1" stopColor="#ffc145" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="owner-edit-gold-c" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#ffe08a" stopOpacity="0" />
                  <stop offset="0.6" stopColor="#ffe08a" stopOpacity="0.55" />
                  <stop offset="1" stopColor="#ffe08a" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M80 62 C 180 58, 240 30, 340 36 C 430 42, 500 56, 580 50" fill="none" stroke="url(#owner-edit-gold-a)" strokeWidth="1.55" strokeLinecap="round" />
              <path d="M100 74 C 200 70, 260 46, 360 50 C 450 54, 510 66, 570 62" fill="none" stroke="url(#owner-edit-gold-b)" strokeWidth="1.2" strokeLinecap="round" opacity="0.95" />
              <path d="M120 50 C 210 46, 270 68, 370 62 C 460 56, 520 40, 590 44" fill="none" stroke="url(#owner-edit-gold-c)" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
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
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <form className="owner-acct" onSubmit={onSubmit}>
          <AuthToast
            message={error}
            tone="error"
            onDismiss={() => setError(null)}
          />
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
                    <small>Admin can directly update verification status.</small>
                  </div>
                </div>
                <OwnerVerifyCard
                  icon={<MailGlyph />}
                  title="Email verification"
                  verified={emailVerified}
                  busy={verifyBusy === "email"}
                  disabled={saving || verifyBusy !== null}
                  onToggle={() => void toggleVerified("emailVerified")}
                />
                <OwnerVerifyCard
                  icon={<PhoneGlyph />}
                  title="Phone verification"
                  verified={phoneVerified}
                  busy={verifyBusy === "phone"}
                  disabled={saving || verifyBusy !== null || !phone.trim()}
                  onToggle={() => void toggleVerified("phoneVerified")}
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
