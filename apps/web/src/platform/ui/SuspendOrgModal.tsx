import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "../../auth/AuthToast";

const REASON_MAX = 500;

type Props = {
  orgName: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
};

function SuspendPauseIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 6.75v6.5M12 6.75v6.5"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SuspendCloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M5 5l10 10M15 5L5 15"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SuspendConfirmIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M7.25 4.75v10.5M12.75 4.75v10.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SuspendInfoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 9v4.25M10 6.5h.01"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SuspendOrgModal({
  orgName,
  busy = false,
  error = null,
  onClose,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");
  const [toastError, setToastError] = useState<string | null>(null);
  const uid = useId().replace(/:/g, "");
  const gA = `suspend-gold-a-${uid}`;
  const gB = `suspend-gold-b-${uid}`;
  const gC = `suspend-gold-c-${uid}`;

  useEffect(() => {
    setReason("");
  }, [orgName]);

  useEffect(() => {
    setToastError(error);
  }, [error]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  function onReasonChange(value: string) {
    setReason(value.slice(0, REASON_MAX));
  }

  return createPortal(
    <>
      <AuthToast
        message={toastError}
        tone="error"
        onDismiss={() => setToastError(null)}
      />
      <div
        className="b3-commission-modal-backdrop"
        role="presentation"
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          className="b3-commission-modal b3-suspend-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="suspend-org-title"
          aria-describedby="suspend-org-subtitle"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="b3-suspend-modal__head">
            <div className="b3-suspend-modal__aura" aria-hidden>
              <svg
                className="b3-suspend-modal__aura-svg"
                viewBox="0 0 640 96"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id={gA} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(255,208,96,0)" />
                    <stop offset="18%" stopColor="rgba(255,220,140,0.82)" />
                    <stop offset="45%" stopColor="rgba(255,208,96,0.52)" />
                    <stop offset="72%" stopColor="rgba(255,193,69,0.24)" />
                    <stop offset="100%" stopColor="rgba(255,208,96,0)" />
                  </linearGradient>
                  <linearGradient id={gB} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(255,208,96,0)" />
                    <stop offset="26%" stopColor="rgba(255,230,160,0.58)" />
                    <stop offset="55%" stopColor="rgba(255,193,69,0.3)" />
                    <stop offset="100%" stopColor="rgba(255,208,96,0)" />
                  </linearGradient>
                  <linearGradient id={gC} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(255,208,96,0)" />
                    <stop offset="34%" stopColor="rgba(255,208,96,0.4)" />
                    <stop offset="66%" stopColor="rgba(255,193,69,0.16)" />
                    <stop offset="100%" stopColor="rgba(255,208,96,0)" />
                  </linearGradient>
                </defs>
                <path
                  d="M80 62 C 180 58, 240 30, 340 36 C 430 42, 500 56, 580 50"
                  fill="none"
                  stroke={`url(#${gA})`}
                  strokeWidth="1.55"
                  strokeLinecap="round"
                />
                <path
                  d="M100 74 C 200 70, 260 46, 360 50 C 450 54, 510 66, 570 62"
                  fill="none"
                  stroke={`url(#${gB})`}
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  opacity="0.95"
                />
                <path
                  d="M120 50 C 210 46, 270 68, 370 62 C 460 56, 520 40, 590 44"
                  fill="none"
                  stroke={`url(#${gC})`}
                  strokeWidth="1"
                  strokeLinecap="round"
                  opacity="0.8"
                />
              </svg>
            </div>
            <div className="b3-suspend-modal__head-main">
              <span className="b3-suspend-modal__mark" aria-hidden>
                <SuspendPauseIcon />
              </span>
              <div className="b3-suspend-modal__titles">
                <h3 id="suspend-org-title">Suspend account</h3>
                <p id="suspend-org-subtitle">
                  Temporarily disable this account and prevent it from
                  processing new transactions.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="b3-commission-modal__close b3-suspend-modal__close"
              aria-label="Close"
              disabled={busy}
              onClick={onClose}
            >
              <SuspendCloseIcon />
            </button>
          </header>

          <div className="b3-commission-modal__body b3-suspend-modal__body">
            <div className="b3-suspend-modal__field">
              <label
                className="b3-suspend-modal__label"
                htmlFor="suspend-org-reason"
              >
                Reason (optional)
              </label>
              <div className="b3-suspend-modal__reason-wrap">
                <textarea
                  id="suspend-org-reason"
                  className="b3-suspend-modal__reason"
                  rows={4}
                  value={reason}
                  disabled={busy}
                  maxLength={REASON_MAX}
                  placeholder="e.g. compliance review, billing dispute, requested by agent"
                  onChange={(e) => onReasonChange(e.target.value)}
                  autoFocus
                />
                <span className="b3-suspend-modal__count" aria-live="polite">
                  {reason.length}/{REASON_MAX}
                </span>
              </div>
            </div>

            <div className="b3-suspend-modal__callout" role="note">
              <span className="b3-suspend-modal__callout-icon" aria-hidden>
                <SuspendInfoIcon />
              </span>
              <div className="b3-suspend-modal__callout-copy">
                <p className="b3-suspend-modal__callout-title">
                  The account will be suspended immediately.
                </p>
                <p className="b3-suspend-modal__callout-text">
                  The merchant will not be able to process new transactions
                  until it is reactivated.
                </p>
              </div>
            </div>
          </div>

          <footer className="b3-commission-modal__foot b3-suspend-modal__foot">
            <div className="b3-suspend-modal__foot-left">
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
              className="b3-suspend-modal__confirm"
              disabled={busy}
              onClick={() => onConfirm(reason.trim())}
            >
              <SuspendConfirmIcon />
              {busy ? "Suspending…" : "Suspend account"}
            </button>
          </footer>
        </div>
      </div>
    </>,
    document.body,
  );
}
