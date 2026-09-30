import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { InviteCredentialsPanel } from "../auth/InviteCredentialsPanel";
import { OrgEditWaves } from "./OrgEditWaves";
import type { OnboardInviteCreds } from "./onboardInviteState";

type Props = {
  siteName: string;
  creds: OnboardInviteCreds;
  /** Closes the window and opens the new site. */
  onDone: () => void;
};

/** Shown once after New site: the owner's temporary password and invite link. */
export function SiteOwnerInvitedModal({ siteName, creds, onDone }: Props) {
  const titleId = useId();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDone();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDone]);

  return createPortal(
    <div className="b3-commission-modal-backdrop" role="presentation">
      <div
        className="b3-commission-modal site-owner-invited-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="org-edit__head">
          <span className="org-edit__head-icon" aria-hidden>
            <InvitedGlyph />
          </span>
          <div className="org-edit__head-copy">
            <h3 id={titleId}>Site created</h3>
            <p>
              <strong>{siteName}</strong> is ready. Share the owner's sign-in details
              below if the email doesn't arrive.
            </p>
          </div>
          <OrgEditWaves />
          <button type="button" className="org-edit__close" aria-label="Close" onClick={onDone}>
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="site-owner-invited-modal__body">
          <InviteCredentialsPanel
            email={creds.invitedEmail}
            temporaryPassword={creds.temporaryPassword}
            inviteUrl={creds.inviteUrl}
            invitePath={creds.invitePath}
            emailDeliveryStatus={creds.emailDelivery?.status}
          />
          <p className="site-owner-invited-modal__note">
            The password is shown only once. Copy or share it before closing.
          </p>
        </div>
        <footer className="org-edit__foot site-owner-invited-modal__foot">
          <span />
          <button type="button" className="org-edit__save" onClick={onDone} autoFocus>
            Open site
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function InvitedGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
      <circle cx="8.5" cy="7" r="3.5" />
      <path d="m16 11 2 2 4-4" />
    </svg>
  );
}
