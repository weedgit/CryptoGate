import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { MFA_SETUP_PARAM, withEditParam } from "../shared/modalLinks";
export type MfaEnrollRequiredModalProps = {
  onClose: () => void;
  /** Short label for the protected action, e.g. "save settlement address". */
  actionLabel?: string;
  /** Owner / Administrator — can open Profile and enroll. */
  canEnroll: boolean;
  /** Enrollment started but verify step not finished. */
  enrollmentPending?: boolean;
};

/**
 * Shown instead of MFA code entry when a privileged action requires TOTP
 * but the signed-in user has not completed enrollment yet.
 */
export function MfaEnrollRequiredModal({
  onClose,
  actionLabel,
  canEnroll,
  enrollmentPending = false,
}: MfaEnrollRequiredModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const navigate = useNavigate();
  const location = useLocation();
  const action = actionLabel?.trim() || "complete this action";
  let title = "Set up two-factor auth first";
  let body: string;
  let setupLabel: string | null = "Set up two-factor auth";

  if (!canEnroll) {
    body = `This action requires two-factor authentication. Ask an Owner or Administrator on your account to enroll MFA in Profile → Security before you can ${action}.`;
    setupLabel = null;
  } else if (enrollmentPending) {
    title = "Finish two-factor setup";
    body = `Required to ${action}.`;
    setupLabel = "Finish setup";
  } else {
    body = `Required to ${action}.`;
  }

  function openSetup() {
    onClose();
    navigate(withEditParam(`${location.pathname}${location.search}`, MFA_SETUP_PARAM));
  }

  return createPortal(
    <div
      className="mfa-stepup-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="mfa-req"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-enroll-required-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mfa-req__hero" aria-hidden>
          <svg className="mfa-req__waves" viewBox="0 0 640 120" preserveAspectRatio="none">
            <defs>
              <linearGradient id="mfa-req-wave-a" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="currentColor" stopOpacity="0" />
                <stop offset="0.5" stopColor="currentColor" stopOpacity="0.9" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="mfa-req-wave-b" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="currentColor" stopOpacity="0" />
                <stop offset="0.65" stopColor="currentColor" stopOpacity="0.6" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 70 C 120 40, 220 40, 320 60 C 420 80, 520 20, 640 30"
              fill="none"
              stroke="url(#mfa-req-wave-a)"
              strokeWidth="1.6"
            />
            <path
              d="M0 50 C 140 80, 230 76, 320 58 C 410 40, 520 44, 640 60"
              fill="none"
              stroke="url(#mfa-req-wave-b)"
              strokeWidth="1.2"
            />
            <path
              d="M0 86 C 150 70, 240 50, 320 62 C 420 76, 520 70, 640 46"
              fill="none"
              stroke="url(#mfa-req-wave-b)"
              strokeWidth="1"
              opacity="0.7"
            />
          </svg>
          <span className="mfa-req__icon">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3.2 19 6v5.6c0 4.3-2.9 7.4-7 9.2-4.1-1.8-7-4.9-7-9.2V6l7-2.8Z"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
        <h2 id="mfa-enroll-required-title" className="mfa-req__title">
          {title}
        </h2>
        <p className="mfa-req__body">{body}</p>
        {setupLabel ? (
          <>
            <button type="button" className="mfa-req__primary" onClick={openSetup}>
              {setupLabel}
            </button>
            <button type="button" className="mfa-req__later" onClick={onClose}>
              Not now
            </button>
          </>
        ) : (
          <button type="button" className="mfa-req__primary" onClick={onClose}>
            OK
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
