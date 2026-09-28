import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ApiError, enrollMfa, verifyMfa } from "../merchant/api";
import { AuthLayout } from "./AuthLayout";
import { AuthToast } from "./AuthToast";
import { CopyIcon } from "./LoginIcons";
import { MfaCodeInput } from "./MfaCodeInput";
import { formatManualSecret } from "./passwordPolicy";

type Props = {
  onComplete: () => void;
  onCancel: () => void;
  /** When false, hide Back / cancel (forced A5 enrollment). Default true. */
  cancelable?: boolean;
  /** "modal" renders a pop-up over the current page instead of a full auth page. */
  variant?: "page" | "modal";
  /** Page variant: hero product line (matches the portal sign-in page). */
  productLine?: string;
  /** Page variant: message shown above the card. */
  notice?: ReactNode;
};

type Step = "loading" | "scan" | "verify";

export function MfaEnrollmentWizard({
  onComplete,
  onCancel,
  cancelable = true,
  variant = "page",
  productLine,
  notice,
}: Props) {
  const [step, setStep] = useState<Step>("loading");
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [resumedSetup, setResumedSetup] = useState(false);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    enrollMfa()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setSecret(payload.secret);
        setOtpauthUrl(payload.otpauthUrl);
        setResumedSetup(payload.resumed === true);
        setStep("scan");
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof ApiError ? err.message : "Enrollment failed");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (variant !== "modal" || !cancelable) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [variant, cancelable, onCancel]);

  async function onVerifySubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await verifyMfa(code);
      onComplete();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  async function onCopySecret() {
    try {
      await navigator.clipboard.writeText(secret.replace(/\s+/g, ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  const qrSrc = otpauthUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(otpauthUrl)}`
    : "";

  if (variant === "modal") {
    return createPortal(
      <div
        className="mfa-setup-backdrop"
        role="presentation"
        onClick={(e) => {
          e.stopPropagation();
          if (cancelable && !loading) onCancel();
        }}
      >
        <div
          className="mfa-setup"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mfa-setup-title"
          onClick={(e) => e.stopPropagation()}
        >
          <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
          <header className="mfa-setup__head">
            <span className="mfa-setup__icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3.2 19 6v5.6c0 4.3-2.9 7.4-7 9.2-4.1-1.8-7-4.9-7-9.2V6l7-2.8Z"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div className="mfa-setup__head-copy">
              <p className="mfa-setup__step">
                {step === "verify" ? "Step 2 of 2 · Verify code" : "Step 1 of 2 · Scan QR code"}
              </p>
              <h2 id="mfa-setup-title" className="mfa-setup__title">
                {step === "verify"
                  ? "Confirm authenticator"
                  : resumedSetup
                    ? "Continue two-factor setup"
                    : "Set up two-factor auth"}
              </h2>
            </div>
            {cancelable ? (
              <button
                type="button"
                className="mfa-setup__close"
                aria-label="Close"
                disabled={loading && step === "verify"}
                onClick={onCancel}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
          </header>

          {step === "loading" ? (
            <p className="mfa-setup__lead">
              {loading ? "Preparing authenticator setup…" : "Unable to start setup. Close and try again."}
            </p>
          ) : step === "scan" ? (
            <>
              <p className="mfa-setup__lead">
                Scan the QR code with Google Authenticator, 1Password or another authenticator app.
              </p>
              <div className="mfa-setup__qr">
                {qrSrc ? (
                  <img src={qrSrc} width={180} height={180} alt="Authenticator QR code" />
                ) : null}
              </div>
              <div className="mfa-setup__secret">
                <span className="mfa-setup__secret-label">Or enter code manually</span>
                <div className="mfa-setup__secret-box">
                  <code>{formatManualSecret(secret)}</code>
                  <button
                    type="button"
                    className={`cg-copy-btn mfa-setup__copy${copied ? " is-copied" : ""}`}
                    onClick={() => void onCopySecret()}
                    aria-label={copied ? "Copied" : "Copy secret key"}
                    title={copied ? "Copied" : "Copy secret key"}
                  >
                    <CopyIcon copied={copied} />
                  </button>
                </div>
              </div>
              <div className="mfa-setup__actions">
                {cancelable ? (
                  <button type="button" className="mfa-setup__secondary" onClick={onCancel}>
                    Cancel
                  </button>
                ) : null}
                <button type="button" className="mfa-setup__primary" onClick={() => setStep("verify")}>
                  Continue
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={onVerifySubmit}>
              <p className="mfa-setup__lead">
                Enter the 6-digit code from your authenticator app to finish setup.
              </p>
              <MfaCodeInput
                className="mfa-setup__slots"
                value={code}
                onChange={setCode}
                onComplete={async (value) => {
                  setCode(value);
                  setLoading(true);
                  setError(null);
                  try {
                    await verifyMfa(value);
                    onComplete();
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : "Verification failed");
                    setCode("");
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              />
              <div className="mfa-setup__actions">
                <button type="button" className="mfa-setup__secondary" onClick={() => setStep("scan")}>
                  Back
                </button>
                <button
                  className="mfa-setup__primary"
                  type="submit"
                  disabled={loading || code.length !== 6}
                >
                  {loading ? "Please wait…" : "Enable two-factor"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <AuthLayout wide footer={false} productLine={productLine}>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      {notice ? (
        <div className="mfa-force-notice" role="status">
          {notice}
        </div>
      ) : null}

      {step === "loading" ? (
        <div className="login-card login-card--enter mfa-enroll-card">
          <p style={{ color: "var(--muted)", margin: 0 }}>
            {loading ? "Preparing authenticator setup…" : "Unable to start enrollment."}
          </p>
          {!loading && cancelable ? (
            <button type="button" className="login-submit" onClick={onCancel}>
              Back
            </button>
          ) : null}
        </div>
      ) : step === "scan" ? (
        <div className="login-card login-card--enter mfa-enroll-card">
          <div className="mfa-enroll-head">
            <div className="mfa-enroll-step">
              <span className="mfa-enroll-step-dot" aria-hidden />
              Step 2 of 3: Authenticator App
            </div>
            <h1>{resumedSetup ? "Continue authenticator setup" : "Secure your operator account"}</h1>
            <p>
              {resumedSetup
                ? "Your existing setup code is shown below. Scan the QR code or copy the manual secret, then continue to verification."
                : "Scan the QR code with Google Authenticator or 1Password to enroll your device in Multi-Factor Authentication."}
            </p>
          </div>

          <div className="mfa-enroll-qr">
            {qrSrc ? (
              <img src={qrSrc} width={180} height={180} alt="Authenticator QR code" />
            ) : null}
          </div>

          <div className="mfa-enroll-secret">
            <span className="mfa-enroll-secret-label">Or enter code manually</span>
            <div className="mfa-enroll-secret-box">
              <code>{formatManualSecret(secret)}</code>
              <button
                type="button"
                className={`cg-copy-btn mfa-enroll-copy${copied ? " is-copied" : ""}`}
                onClick={() => void onCopySecret()}
                aria-label={copied ? "Copied" : "Copy secret key"}
                title={copied ? "Copied" : "Copy secret key"}
              >
                <CopyIcon copied={copied} />
              </button>
            </div>
          </div>

          <div className="mfa-enroll-actions">
            {cancelable ? (
              <button type="button" className="login-btn-secondary" onClick={onCancel}>
                Back
              </button>
            ) : null}
            <button type="button" className="login-submit" onClick={() => setStep("verify")}>
              Continue
            </button>
          </div>
        </div>
      ) : (
        <form className="login-card login-card--enter mfa-enroll-card" onSubmit={onVerifySubmit}>
          <div className="mfa-enroll-head">
            <div className="mfa-enroll-step">
              <span className="mfa-enroll-step-dot" aria-hidden />
              Step 3 of 3: Verify code
            </div>
            <h1>Confirm authenticator</h1>
            <p>Enter the 6-digit code from your authenticator app to finish enrollment.</p>
          </div>

          <MfaCodeInput
            value={code}
            onChange={setCode}
            onComplete={async (value) => {
              setCode(value);
              setLoading(true);
              setError(null);
              try {
                await verifyMfa(value);
                onComplete();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Verification failed");
                setCode("");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
          />

          <div className="mfa-enroll-actions">
            <button type="button" className="login-btn-secondary" onClick={() => setStep("scan")}>
              Back
            </button>
            <button className="login-submit" type="submit" disabled={loading || code.length !== 6}>
              {loading ? "Please wait…" : "Enable MFA"}
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
