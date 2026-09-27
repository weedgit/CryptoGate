import { FormEvent, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "./AuthToast";
import { MfaCodeInput } from "./MfaCodeInput";
import { MailIcon, PhoneIcon } from "./LoginIcons";

const RESEND_SECONDS = 45;

export type ContactOtpModalProps = {
  channel: "email" | "phone";
  /** Destination shown in copy (new email or phone). */
  destination: string;
  /** True when verifying a change; current value stays active until confirm. */
  pendingChange?: boolean;
  /** Dev/test environments may echo the OTP. */
  initialCode?: string;
  onClose: () => void;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<{ code?: string } | void>;
};

/**
 * Focused popup for email/SMS OTP — same shell as login / MFA step-up.
 */
export function ContactOtpModal({
  channel,
  destination,
  pendingChange = false,
  initialCode = "",
  onClose,
  onVerify,
  onResend,
}: ContactOtpModalProps) {
  const [code, setCode] = useState(initialCode.replace(/\D/g, "").slice(0, 6));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const t = window.setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendSeconds]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy && !resending) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, resending]);

  const submitCode = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (busy || trimmed.length !== 6) return;
      setBusy(true);
      setError(null);
      try {
        await onVerify(trimmed);
        onClose();
      } catch (err) {
        setCode("");
        setError(err instanceof Error ? err.message : "Verification failed");
        setShake(true);
      } finally {
        setBusy(false);
      }
    },
    [busy, onClose, onVerify],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await submitCode(code);
  }

  async function handleResend() {
    if (resending || resendSeconds > 0) return;
    setResending(true);
    setError(null);
    try {
      const result = await onResend();
      const next = result?.code?.replace(/\D/g, "").slice(0, 6) ?? "";
      if (next) setCode(next);
      setResendSeconds(RESEND_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code");
    } finally {
      setResending(false);
    }
  }

  const isEmail = channel === "email";
  const title = isEmail ? "Verify email" : "Verify phone";
  const subtitle = isEmail
    ? `Enter the 6-digit code sent to ${destination}`
    : `Enter the 6-digit code texted to ${destination}`;
  const pendingHint = pendingChange
    ? isEmail
      ? "Your current email stays active until this code is confirmed."
      : "Your current number stays active until this code is confirmed."
    : null;

  const cardClass = `login-card login-card--mfa mfa-stepup-card${shake ? " login-card--shake" : ""}`;

  return createPortal(
    <div
      className="mfa-stepup-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy && !resending) onClose();
      }}
    >
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      <form
        className={cardClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-otp-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void onSubmit(e)}
        onAnimationEnd={() => setShake(false)}
      >
        <div className="login-mfa-icon" aria-hidden>
          {isEmail ? <MailIcon /> : <PhoneIcon />}
        </div>

        <div className="login-card-head login-card-head--center">
          <h1 id="contact-otp-title">{title}</h1>
          <p>{subtitle}</p>
          {pendingHint ? (
            <p className="login-mfa-hint" style={{ marginTop: 8 }}>
              {pendingHint}
            </p>
          ) : null}
        </div>

        <MfaCodeInput
          value={code}
          onChange={setCode}
          onComplete={(next) => void submitCode(next)}
          disabled={busy || resending}
          submitOnComplete
        />

        <div className="login-mfa-meta">
          <p className="login-mfa-resend">
            {resendSeconds > 0 ? (
              <>
                Resend code in <strong>{resendSeconds}s</strong>
              </>
            ) : (
              <button
                type="button"
                className="login-text-link"
                disabled={resending || busy}
                onClick={() => void handleResend()}
              >
                {resending ? "Sending…" : "Resend code"}
              </button>
            )}
          </p>
        </div>

        <button
          className="login-submit"
          type="submit"
          disabled={busy || resending || code.length !== 6}
        >
          {busy ? "Please wait…" : isEmail ? "Confirm email" : "Confirm phone"}
        </button>

        <button
          type="button"
          className="login-text-link"
          style={{ marginTop: 8, alignSelf: "center" }}
          disabled={busy || resending}
          onClick={onClose}
        >
          Cancel
        </button>
      </form>
    </div>,
    document.body,
  );
}
