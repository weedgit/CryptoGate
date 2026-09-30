import { useEffect } from "react";
import { createPortal } from "react-dom";
import { DefaultUserAvatar } from "../auth/DefaultUserAvatar";

export type RemoveMemberTarget = {
  userId: string;
  email: string;
  name?: string | null;
  role?: string | null;
  avatarUrl?: string | null;
};

type Props = {
  target: RemoveMemberTarget;
  /** e.g. "agent", "merchant", "platform". */
  orgLabel: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

function RemoveUserIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M3.5 19.5c.8-3.2 3.3-5 6.5-5 1.6 0 3 .45 4.1 1.3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path d="M16 17h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6.5v4.25M10 13.75h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function roleText(role: string): string {
  return role
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Confirm removing a team member; removal also deletes their account and frees the email. */
export function RemoveMemberModal({ target, orgLabel, busy = false, onClose, onConfirm }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const name = target.name?.trim() || "";
  const showName = name !== "" && name.toLowerCase() !== target.email.toLowerCase();

  return createPortal(
    <div
      className="b3-commission-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="b3-commission-modal org-delete-modal remove-member-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-member-title"
        aria-describedby="remove-member-subtitle"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="org-delete-modal__head">
          <div className="org-delete-modal__head-main">
            <span className="org-delete-modal__mark" aria-hidden>
              <RemoveUserIcon size={30} />
            </span>
            <div className="org-delete-modal__titles">
              <h3 id="remove-member-title">Remove team member</h3>
              <p id="remove-member-subtitle">
                Revokes access to this {orgLabel} organization.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="b3-commission-modal__close org-delete-modal__close"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="b3-commission-modal__body org-delete-modal__body remove-member-modal__body">
          <div className="remove-member-modal__member">
            <span className="remove-member-modal__avatar" aria-hidden>
              {target.avatarUrl ? (
                <img src={target.avatarUrl} alt="" />
              ) : (
                <DefaultUserAvatar className="remove-member-modal__avatar-default" />
              )}
            </span>
            <div className="remove-member-modal__identity">
              {showName ? <span className="remove-member-modal__name">{name}</span> : null}
              <span className="remove-member-modal__email">{target.email}</span>
            </div>
            {target.role ? (
              <span className="remove-member-modal__role">{roleText(target.role)}</span>
            ) : null}
          </div>

          <div className="org-delete-modal__warning remove-member-modal__warning">
            <div className="org-delete-modal__warning-head remove-member-modal__warning-head">
              <span className="org-delete-modal__warning-icon" aria-hidden>
                <AlertIcon />
              </span>
              <div className="org-delete-modal__warning-copy">
                <p className="org-delete-modal__warning-title">Account will be deleted</p>
                <p className="org-delete-modal__warning-text">
                  This cannot be undone.
                </p>
              </div>
            </div>
            <ul className="remove-member-modal__effects">
              <li>Signed out everywhere and loses portal access immediately.</li>
              <li>Sign-in, verified phone, and authenticator are removed.</li>
              <li>The email can be invited again as a new account.</li>
            </ul>
          </div>
        </div>

        <footer className="b3-commission-modal__foot org-delete-modal__foot">
          <div className="org-delete-modal__foot-left">
            <button
              type="button"
              className="b3-commission-modal__cancel"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
          <button
            type="button"
            className="org-delete-modal__confirm"
            disabled={busy}
            onClick={onConfirm}
          >
            <RemoveUserIcon size={16} />
            {busy ? "Removing…" : "Remove member"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
