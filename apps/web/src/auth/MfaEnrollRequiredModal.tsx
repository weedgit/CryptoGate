import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ShieldIcon } from "./LoginIcons";

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

  const action = actionLabel?.trim() || "complete this action";
  let title = "Set up two-factor auth first";
  let body: string;

  if (!canEnroll) {
    body = `This action requires two-factor authentication. Ask an Owner or Administrator on your account to enroll MFA in Profile → Security before you can ${action}.`;
  } else if (enrollmentPending) {
    title = "Finish MFA setup";
    body = `You started MFA setup but have not finished. Open Profile from the sidebar, go to Security, and enter the 6-digit code from your authenticator. Then try again to ${action}.`;
  } else {
    body = `Before you can ${action}, enroll two-factor authentication. Open Profile from the sidebar, go to Security, and set up your authenticator app.`;
  }

  return createPortal(
    <div
      className="mfa-stepup-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="login-card login-card--mfa mfa-stepup-card mfa-enroll-required-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-enroll-required-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="login-mfa-icon" aria-hidden>
          <ShieldIcon />
        </div>
        <div className="login-card-head login-card-head--center">
          <h1 id="mfa-enroll-required-title">{title}</h1>
          <p>{body}</p>
        </div>
        <button type="button" className="login-submit" onClick={onClose}>
          OK
        </button>
      </div>
    </div>,
    document.body,
  );
}
