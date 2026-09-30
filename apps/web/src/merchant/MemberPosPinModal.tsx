import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { OrgEditWaves } from "../shared/OrgEditWaves";

type Props = {
  email: string;
  /** Freshly generated PIN; shown only while the modal stays open. */
  pin: string | null;
  busy: boolean;
  onGenerate: () => void;
  onClose: () => void;
  onClear: () => void;
};

function PinPadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 7.5h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8.6" cy="11.6" r="1" fill="currentColor" />
      <circle cx="12" cy="11.6" r="1" fill="currentColor" />
      <circle cx="15.4" cy="11.6" r="1" fill="currentColor" />
      <circle cx="8.6" cy="15.4" r="1" fill="currentColor" />
      <circle cx="12" cy="15.4" r="1" fill="currentColor" />
      <circle cx="15.4" cy="15.4" r="1" fill="currentColor" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h14M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7M7 7l.8 11.2A2 2 0 0 0 9.8 20h4.4a2 2 0 0 0 2-1.8L17 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="8" cy="15" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/** Owner/Admin generates or clears a member's POS PIN. The server returns the PIN once. */
export function MemberPosPinModal({ email, pin, busy, onGenerate, onClose, onClear }: Props) {
  const titleId = useId();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [pin]);

  async function copyPin() {
    if (!pin) return;
    try {
      await navigator.clipboard.writeText(pin);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return createPortal(
    <div
      className="b3-commission-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy && !pin) onClose();
      }}
    >
      <div
        className="b3-commission-modal pos-pin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="org-edit__head">
          <span className="org-edit__head-icon" aria-hidden>
            <PinPadIcon />
          </span>
          <div className="org-edit__head-copy">
            <h3 id={titleId}>{pin ? "New POS PIN" : "Generate PIN"}</h3>
            <p>
              {pin ? (
                <>
                  POS unlock PIN for <strong>{email}</strong>.
                </>
              ) : (
                <>
                  Create a new POS unlock PIN for <strong>{email}</strong>.
                </>
              )}
            </p>
          </div>
          <OrgEditWaves />
          <button
            type="button"
            className="org-edit__close"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>
        <div className="pos-pin-modal__body">
          {pin ? (
            <>
              <output className="pos-pin-modal__pin" aria-label="Generated PIN">
                {pin}
              </output>
              <p className="pos-pin-modal__notice">
                This PIN is shown only once. Give it to the team member now. It can&apos;t be
                viewed again; generate a new one if it&apos;s lost.
              </p>
            </>
          ) : (
            <p className="pos-pin-modal__notice">
              The server creates a 6-digit PIN. Any PIN this member already has stops working
              right away.
            </p>
          )}
        </div>
        <footer className="org-edit__foot pos-pin-modal__foot">
          {pin ? (
            <div className="pos-pin-modal__actions pos-pin-modal__actions--end">
              <button
                type="button"
                className="org-edit__cancel pos-pin-modal__copy"
                onClick={() => void copyPin()}
              >
                <CopyIcon />
                {copied ? "Copied" : "Copy"}
              </button>
              <button type="button" className="org-edit__save" onClick={onClose}>
                Done
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="org-edit__cancel pos-pin-modal__clear"
                disabled={busy}
                onClick={onClear}
              >
                <ClearIcon />
                Clear
              </button>
              <div className="pos-pin-modal__actions">
                <button
                  type="button"
                  className="org-edit__save"
                  disabled={busy}
                  onClick={onGenerate}
                >
                  <KeyIcon />
                  {busy ? "Generating…" : "Generate"}
                </button>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
