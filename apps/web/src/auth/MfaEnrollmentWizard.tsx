import { FormEvent, useEffect, useState } from "react";
import { ApiError, enrollMfa, verifyMfa } from "../merchant/api";
import { AuthLayout } from "./AuthLayout";
import { AuthToast } from "./AuthToast";
import { GateLogoMark } from "./GateLogoMark";
import { CopyIcon } from "./LoginIcons";
import { MfaCodeInput } from "./MfaCodeInput";
import { formatManualSecret } from "./passwordPolicy";

type Props = {
  onComplete: () => void;
  onCancel: () => void;
  /** When false, hide Back / cancel (forced A5 enrollment). Default true. */
  cancelable?: boolean;
};

type Step = "loading" | "scan" | "verify";

export function MfaEnrollmentWizard({
  onComplete,
  onCancel,
  cancelable = true,
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

  return (
    <AuthLayout wide footer={false}>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <div className="login-brand login-brand--compact">
        <GateLogoMark size={32} className="login-logo-mark-svg" />
        <span className="login-brand-name login-brand-name--compact">CryptoGate</span>
      </div>

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
                className={`mfa-enroll-copy${copied ? " is-copied" : ""}`}
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
