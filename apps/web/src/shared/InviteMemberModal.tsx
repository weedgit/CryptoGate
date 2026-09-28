import { useId, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { InviteCredentialsPanel } from "../auth/InviteCredentialsPanel";
import { FieldControl } from "../ui/FieldControl";
import { SearchableSelect, type SearchableSelectOption } from "../ui/SearchableSelect";

export type InviteModalCredentials = {
  invitedEmail: string;
  temporaryPassword?: string | null;
  inviteUrl?: string | null;
  invitePath?: string | null;
  emailDelivery?: { status?: string | null } | null;
};

type Props = {
  /** "Invite member" / "Invite cashier". */
  title: string;
  /** Submit button text before inviting (defaults to "Invite"). */
  submitLabel?: string;
  email: string;
  onEmailChange: (value: string) => void;
  role: string;
  roleOptions: SearchableSelectOption[];
  onRoleChange: (value: string) => void;
  busy: boolean;
  creds: InviteModalCredentials | null;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

/** Team invite dialog — same header, fields and footer as the Edit member modal. */
export function InviteMemberModal({
  title,
  submitLabel = "Invite",
  email,
  onEmailChange,
  role,
  roleOptions,
  onRoleChange,
  busy,
  creds,
  onSubmit,
  onClose,
}: Props) {
  const titleId = useId();
  const locked = busy || Boolean(creds);
  return createPortal(
    <div
      className="b3-commission-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="b3-commission-modal b3-owner-edit org-profile-edit-modal invite-member-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="org-edit__head">
          <span className="org-edit__head-icon" aria-hidden>
            <InviteGlyph />
          </span>
          <div className="org-edit__head-copy">
            <h3 id={titleId}>{creds ? "Member invited" : title}</h3>
            <p>
              {creds
                ? "Share the sign-in details below if the email doesn't arrive."
                : "They'll get an email with a link to sign in and set a password."}
            </p>
          </div>
          <GoldWaves />
          <button
            type="button"
            className="org-edit__close"
            aria-label="Close"
            disabled={busy}
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
        <form className="owner-acct" onSubmit={onSubmit} noValidate>
          <div className="owner-acct__form invite-member-modal__form">
            <label className="owner-acct__field owner-acct__field--wide">
              <span className="owner-acct__label">Email</span>
              <FieldControl icon="mail">
                <input
                  className="field-control"
                  type="email"
                  required
                  autoComplete="off"
                  autoFocus
                  maxLength={254}
                  value={email}
                  disabled={locked}
                  placeholder="name@company.com"
                  onChange={(e) => onEmailChange(e.target.value)}
                />
              </FieldControl>
            </label>
            <div className="owner-acct__field owner-acct__field--wide">
              <span className="owner-acct__label">Role</span>
              <FieldControl icon="user">
                <SearchableSelect
                  value={role}
                  options={roleOptions}
                  onChange={onRoleChange}
                  disabled={locked}
                  allowEmpty={false}
                  placeholder="Select role"
                  ariaLabel="Invite role"
                />
              </FieldControl>
            </div>
            {creds ? (
              <div className="owner-acct__field--wide">
                <InviteCredentialsPanel
                  email={creds.invitedEmail}
                  temporaryPassword={creds.temporaryPassword}
                  inviteUrl={creds.inviteUrl}
                  invitePath={creds.invitePath}
                  emailDeliveryStatus={creds.emailDelivery?.status}
                />
              </div>
            ) : null}
          </div>
          <footer className="owner-acct__foot">
            {creds ? (
              <>
                <span />
                <button type="button" className="owner-acct__save" disabled={busy} onClick={onClose}>
                  Done
                </button>
              </>
            ) : (
              <>
                <button type="button" className="org-edit__cancel" disabled={busy} onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="owner-acct__save"
                  disabled={busy || !email.trim()}
                >
                  <SendGlyph />
                  {busy ? "Inviting…" : submitLabel}
                </button>
              </>
            )}
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function GoldWaves() {
  const id = useId().replace(/:/g, "");
  const stop = (base: string, alpha: number) => ({ stopColor: `rgb(var(${base}) / ${alpha})` });
  return (
    <div className="org-edit__waves" aria-hidden>
      <svg viewBox="0 0 640 96" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${id}-a`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={stop("--gw-base, 255 208 96", 0)} />
            <stop offset="18%" style={stop("--gw-hi, 255 220 140", 0.82)} />
            <stop offset="45%" style={stop("--gw-base, 255 208 96", 0.52)} />
            <stop offset="72%" style={stop("--gw-deep, 255 193 69", 0.24)} />
            <stop offset="100%" style={stop("--gw-base, 255 208 96", 0)} />
          </linearGradient>
          <linearGradient id={`${id}-b`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={stop("--gw-base, 255 208 96", 0)} />
            <stop offset="26%" style={stop("--gw-hi, 255 230 160", 0.58)} />
            <stop offset="55%" style={stop("--gw-deep, 255 193 69", 0.3)} />
            <stop offset="100%" style={stop("--gw-base, 255 208 96", 0)} />
          </linearGradient>
          <linearGradient id={`${id}-c`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={stop("--gw-base, 255 208 96", 0)} />
            <stop offset="34%" style={stop("--gw-base, 255 208 96", 0.4)} />
            <stop offset="66%" style={stop("--gw-deep, 255 193 69", 0.16)} />
            <stop offset="100%" style={stop("--gw-base, 255 208 96", 0)} />
          </linearGradient>
        </defs>
        <path
          d="M80 62 C 180 58, 240 30, 340 36 C 430 42, 500 56, 580 50"
          fill="none"
          stroke={`url(#${id}-a)`}
          strokeWidth="1.55"
          strokeLinecap="round"
        />
        <path
          d="M100 74 C 200 70, 260 46, 360 50 C 450 54, 510 66, 570 62"
          fill="none"
          stroke={`url(#${id}-b)`}
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.95"
        />
        <path
          d="M120 50 C 210 46, 270 68, 370 62 C 460 56, 520 40, 590 44"
          fill="none"
          stroke={`url(#${id}-c)`}
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.8"
        />
      </svg>
    </div>
  );
}

function InviteGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
      <circle cx="8.5" cy="7" r="3.5" />
      <path d="M19 8v6M16 11h6" />
    </svg>
  );
}

function SendGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}
