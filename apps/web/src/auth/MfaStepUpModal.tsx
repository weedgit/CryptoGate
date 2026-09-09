import { FormEvent, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "./AuthToast";
import { MfaCodeInput } from "./MfaCodeInput";
import { ShieldIcon } from "./LoginIcons";

const RESEND_SECONDS = 30;

export type MfaStepUpModalProps = {
  onClose: () => void;
  /** Throw or reject on failure; resolve on success. TOTP only (Phase 1). */
  onVerify: (mfaCode: string) => Promise<void>;
  onSuccess?: () => void;
};

/**
 * Privileged-action MFA — pixel-matched to login Two-Factor Auth.
 * Backup codes are not issued in Phase 1; use Profile → Replace authenticator.
 */
export function MfaStepUpModal({ onClose, onVerify, onSuccess }: MfaStepUpModalProps) {
  const [mfaCode, setMfaCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const t = window.setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendSeconds]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const submitCode = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (busy || !trimmed) return;
      setBusy(true);
      setError(null);
      try {
        await onVerify(trimmed);
        onSuccess?.();
        onClose();
      } catch (err) {
        setMfaCode("");
        setError(err instanceof Error ? err.message : "Verification failed");
        setShake(true);
      } finally {
        setBusy(false);
      }
    },
    [busy, onClose, onSuccess, onVerify],
  );

  async function onMfaSubmit(event: FormEvent) {
    event.preventDefault();
    await submitCode(mfaCode);
  }

  const cardClass = `login-card login-card--mfa mfa-stepup-card${shake ? " login-card--shake" : ""}`;

  return createPortal(
    <div
      className="mfa-stepup-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      <form
        className={cardClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-stepup-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void onMfaSubmit(e)}
        onAnimationEnd={() => setShake(false)}
      >
        <div className="login-mfa-icon" aria-hidden>
          <ShieldIcon />
        </div>

        <div className="login-card-head login-card-head--center">
          <h1 id="mfa-stepup-title">Two-Factor Auth</h1>
          <p>Enter 6-digit code from your authenticator app</p>
        </div>

        <MfaCodeInput
          value={mfaCode}
          onChange={setMfaCode}
          onComplete={(code) => void submitCode(code)}
          disabled={busy}
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
                onClick={() => setResendSeconds(RESEND_SECONDS)}
              >
                Resend code
              </button>
            )}
          </p>
        </div>

        {error ? (
          <p className="login-mfa-hint">Check that your device time is correct.</p>
        ) : null}

        <button
          className="login-submit"
          type="submit"
          disabled={busy || mfaCode.length !== 6}
        >
          {busy ? "Please wait…" : "Verify"}
        </button>
      </form>
    </div>,
    document.body,
  );
}
