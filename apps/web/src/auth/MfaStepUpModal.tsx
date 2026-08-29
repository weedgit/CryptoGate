import { FormEvent, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AuthField } from "./AuthField";
import { AuthToast } from "./AuthToast";
import { MfaCodeInput } from "./MfaCodeInput";
import { ShieldIcon } from "./LoginIcons";

const RESEND_SECONDS = 30;

export type MfaStepUpModalProps = {
  onClose: () => void;
  /** Throw or reject on failure; resolve on success. Accepts TOTP or backup code. */
  onVerify: (mfaCode: string) => Promise<void>;
  onSuccess?: () => void;
};

type View = "mfa" | "backup";

/**
 * Privileged-action MFA — pixel-matched to login Two-Factor Auth.
 */
export function MfaStepUpModal({ onClose, onVerify, onSuccess }: MfaStepUpModalProps) {
  const [view, setView] = useState<View>("mfa");
  const [mfaCode, setMfaCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (view !== "mfa" || resendSeconds <= 0) return;
    const t = window.setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [view, resendSeconds]);

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
        setBackupCode("");
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

  async function onBackupSubmit(event: FormEvent) {
    event.preventDefault();
    await submitCode(backupCode);
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

      {view === "backup" ? (
        <form
          className={cardClass}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mfa-stepup-title"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => void onBackupSubmit(e)}
          onAnimationEnd={() => setShake(false)}
        >
          <div className="login-mfa-icon" aria-hidden>
            <ShieldIcon />
          </div>
          <div className="login-card-head login-card-head--center">
            <h1 id="mfa-stepup-title">Backup code</h1>
            <p>Enter one of your saved backup codes</p>
          </div>
          <AuthField
            id="stepup-backup-code"
            label="Backup code"
            value={backupCode}
            onChange={setBackupCode}
            placeholder="Enter backup code"
            disabled={busy}
            autoComplete="off"
            required
          />
          <button
            className="login-submit"
            type="submit"
            disabled={busy || !backupCode.trim()}
          >
            {busy ? "Please wait…" : "Verify"}
          </button>
          <button
            type="button"
            className="login-text-link login-back-link"
            disabled={busy}
            onClick={() => {
              setView("mfa");
              setBackupCode("");
              setError(null);
            }}
          >
            Use authenticator code
          </button>
        </form>
      ) : (
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
            <button
              type="button"
              className="login-text-link"
              onClick={() => {
                setView("backup");
                setError(null);
              }}
            >
              Use backup code
            </button>
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
      )}
    </div>,
    document.body,
  );
}
