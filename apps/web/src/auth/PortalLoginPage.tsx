import { FormEvent, useCallback, useEffect, useRef, useState, type AnimationEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ApiError,
  login,
  requestPasswordReset,
  resetPasswordWithToken,
  verifyMfa,
} from "../merchant/api";
import { AuthField } from "./AuthField";
import { AuthLayout } from "./AuthLayout";
import { AuthToast } from "./AuthToast";
import { PolicyCheckIcon, ShieldIcon } from "./LoginIcons";
import { MfaCodeInput } from "./MfaCodeInput";
import {
  evaluatePasswordPolicy,
  passwordPolicyLabel,
} from "./passwordPolicy";
import {
  hadRememberedEmail,
  loadRememberedEmail,
  persistRememberedEmail,
} from "./loginEnv";
import { consumeSessionNotice } from "./apiFetch";

type Props = {
  portalSubtitle: string;
  onSignedIn: () => void;
  startOnMfa?: boolean;
};

type View = "login" | "forgot" | "reset" | "mfa" | "backup";

const RESEND_SECONDS = 30;
const SHAKE_MS = 480;

export function PortalLoginPage({
  portalSubtitle,
  onSignedIn,
  startOnMfa = false,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get("token") ?? "";
  const toastDelayRef = useRef<number | null>(null);

  const [view, setView] = useState<View>(() => {
    if (location.pathname.endsWith("/reset-password")) return "reset";
    if (startOnMfa) return "mfa";
    return "login";
  });
  const [email, setEmail] = useState(() => loadRememberedEmail());
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(() => hadRememberedEmail());
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(RESEND_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordPolicy = evaluatePasswordPolicy(newPassword);
  const resetSuccess = searchParams.get("reset") === "success";

  const clearToastDelay = useCallback(() => {
    if (toastDelayRef.current != null) {
      window.clearTimeout(toastDelayRef.current);
      toastDelayRef.current = null;
    }
  }, []);

  const showAlarm = useCallback(
    (message: string, opts?: { shake?: boolean }) => {
      setError(message);
      clearToastDelay();
      if (!opts?.shake) {
        setToast(message);
        return;
      }
      setToast(null);
      setShaking(false);
      window.requestAnimationFrame(() => {
        setShaking(true);
      });
      toastDelayRef.current = window.setTimeout(() => {
        setToast(message);
        toastDelayRef.current = null;
      }, SHAKE_MS);
    },
    [clearToastDelay],
  );

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => () => clearToastDelay(), [clearToastDelay]);

  useEffect(() => {
    const notice = consumeSessionNotice();
    if (notice) {
      setToast(notice);
      setError(null);
    }
  }, []);

  useEffect(() => {
    if (location.pathname.endsWith("/reset-password")) {
      setView("reset");
      setTokenExpired(!resetToken.trim());
      return;
    }
    if (location.pathname.endsWith("/forgot-password")) {
      setView("forgot");
      return;
    }
    if (!location.pathname.endsWith("/reset-password")) {
      setView((current) => (current === "reset" ? "login" : current));
    }
  }, [location.pathname, resetToken]);

  useEffect(() => {
    if (view !== "mfa" || resendSeconds <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setResendSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [view, resendSeconds]);

  const completeMfa = useCallback(
    async (code: string) => {
      if (loading || code.length !== 6) {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await verifyMfa(code);
        onSignedIn();
      } catch (err) {
        showAlarm(err instanceof ApiError ? err.message : "Verification failed", {
          shake: true,
        });
        setMfaCode("");
      } finally {
        setLoading(false);
      }
    },
    [loading, onSignedIn, showAlarm],
  );

  async function onLoginSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setShaking(false);
    try {
      const result = await login(email.trim(), password);
      persistRememberedEmail(email, rememberDevice);
      if (result.mfaRequired) {
        setView("mfa");
        setMfaCode("");
        setResendSeconds(RESEND_SECONDS);
        return;
      }
      onSignedIn();
    } catch (err) {
      showAlarm(err instanceof ApiError ? err.message : "Sign-in failed", { shake: true });
    } finally {
      setLoading(false);
    }
  }

  async function onMfaSubmit(event: FormEvent) {
    event.preventDefault();
    await completeMfa(mfaCode);
  }

  async function onBackupSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await verifyMfa(backupCode.trim());
      onSignedIn();
    } catch (err) {
      showAlarm(err instanceof ApiError ? err.message : "Invalid backup code", { shake: true });
    } finally {
      setLoading(false);
    }
  }

  function onCardShakeEnd(event: AnimationEvent<HTMLFormElement>) {
    if (event.animationName === "login-card-shake") {
      setShaking(false);
    }
  }

  const loginCardClass = (...extra: string[]) =>
    ["login-card", ...extra, shaking ? "login-card--shake" : ""].filter(Boolean).join(" ");

  async function onForgotSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await requestPasswordReset(forgotEmail.trim());
      setForgotSent(true);
    } catch (err) {
      showAlarm(err instanceof ApiError ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function onResetSubmit(event: FormEvent) {
    event.preventDefault();
    if (!passwordPolicy.valid) {
      showAlarm("Password does not meet policy requirements.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlarm("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await resetPasswordWithToken(resetToken, newPassword);
      navigate({ pathname: "..", search: "?reset=success" }, { replace: true });
      setView("login");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      if (apiErr?.code === "token_expired" || apiErr?.httpStatus === 410) {
        setTokenExpired(true);
      } else {
        showAlarm(apiErr?.message ?? "Reset failed");
      }
    } finally {
      setLoading(false);
    }
  }

  function backToLogin() {
    setView("login");
    setMfaCode("");
    setBackupCode("");
    setForgotEmail("");
    setForgotSent(false);
    setNewPassword("");
    setConfirmPassword("");
    setTokenExpired(false);
    setError(null);
    setToast(null);
    setShaking(false);
    if (
      location.pathname.endsWith("/reset-password") ||
      location.pathname.endsWith("/forgot-password")
    ) {
      navigate("..", { replace: true });
    }
  }

  function goToForgot() {
    setForgotEmail(email);
    setForgotSent(false);
    setError(null);
    setToast(null);
    setShaking(false);
    navigate("forgot-password");
  }

  const alarm = <AuthToast message={toast} onDismiss={dismissToast} />;

  if (view === "reset") {
    return (
      <>
        {alarm}
      <AuthLayout>
        <form className="login-card" onSubmit={onResetSubmit}>
          <div className="login-card-head">
            <h1>Reset password</h1>
            <p>Choose a new password. Policy is checked live before submit.</p>
          </div>

          {tokenExpired ? (
            <>
              <div className="banner banner-warn">
                This reset link has expired or is invalid.
              </div>
              <button type="button" className="login-text-link login-back-link" onClick={goToForgot}>
                Request a new reset link
              </button>
              <button type="button" className="login-text-link login-back-link" onClick={backToLogin}>
                Back to login
              </button>
            </>
          ) : (
            <>
              <div className="login-fields">
                <AuthField
                  id="new-password"
                  label="New password"
                  value={newPassword}
                  onChange={setNewPassword}
                  type="password"
                  icon="lock"
                  placeholder="Enter new password"
                  disabled={loading}
                  autoComplete="new-password"
                  required
                />
                <AuthField
                  id="confirm-password"
                  label="Confirm password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  type="password"
                  icon="lock"
                  placeholder="Confirm new password"
                  showToggle
                  showPassword={showConfirmPassword}
                  onTogglePassword={() => setShowConfirmPassword((current) => !current)}
                  disabled={loading}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="login-options">
                <div className="login-policy-row">
                  <PolicyCheckIcon active={passwordPolicy.valid} />
                  <span>{passwordPolicyLabel()}</span>
                </div>
                <button type="button" className="login-text-link" onClick={backToLogin}>
                  Back to login
                </button>
              </div>

              <button className="login-submit" type="submit" disabled={loading || !passwordPolicy.valid}>
                {loading ? "Please wait…" : "Reset password"}
              </button>
            </>
          )}
        </form>
      </AuthLayout>
      </>
    );
  }

  if (view === "forgot") {
    return (
      <>
        {alarm}
      <AuthLayout>
        <form className="login-card" onSubmit={onForgotSubmit}>
          <div className="login-card-head">
            <h1>Forgot password</h1>
            <p>If an account exists, we will send a reset link.</p>
          </div>

          {forgotSent ? (
            <div className="banner banner-ok">
              If an account exists, we sent a reset link.
            </div>
          ) : (
            <AuthField
              id="forgot-email"
              label="Email Address"
              value={forgotEmail}
              onChange={setForgotEmail}
              type="email"
              icon="mail"
              placeholder="Name@company.com"
              disabled={loading}
              autoComplete="email"
              required
            />
          )}

          <div className="login-options login-options--end">
            <button type="button" className="login-text-link" onClick={backToLogin}>
              Back to login
            </button>
          </div>

          {!forgotSent ? (
            <button className="login-submit" type="submit" disabled={loading}>
              {loading ? "Please wait…" : "Send reset link"}
            </button>
          ) : null}
        </form>
      </AuthLayout>
      </>
    );
  }

  if (view === "mfa" || view === "backup") {
    return (
      <>
        {alarm}
      <AuthLayout footer={false}>
        {view === "backup" ? (
          <form
            className={loginCardClass("login-card--mfa")}
            onSubmit={onBackupSubmit}
            onAnimationEnd={onCardShakeEnd}
          >
            <div className="login-mfa-icon">
              <ShieldIcon />
            </div>
            <div className="login-card-head login-card-head--center">
              <h1>Backup code</h1>
              <p>Enter one of your saved backup codes</p>
            </div>
            <AuthField
              id="backup-code"
              label="Backup code"
              value={backupCode}
              onChange={setBackupCode}
              placeholder="Enter backup code"
              disabled={loading}
              autoComplete="off"
              required
            />
            <button className="login-submit" type="submit" disabled={loading || !backupCode.trim()}>
              {loading ? "Please wait…" : "Verify"}
            </button>
            <button
              type="button"
              className="login-text-link login-back-link"
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
            className={loginCardClass("login-card--mfa")}
            onSubmit={onMfaSubmit}
            onAnimationEnd={onCardShakeEnd}
          >
            <div className="login-mfa-icon">
              <ShieldIcon />
            </div>
            <div className="login-card-head login-card-head--center">
              <h1>Two-Factor Auth</h1>
              <p>Enter 6-digit code from your authenticator app</p>
            </div>

            <MfaCodeInput
              value={mfaCode}
              onChange={setMfaCode}
              onComplete={completeMfa}
              disabled={loading}
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

            <button className="login-submit" type="submit" disabled={loading || mfaCode.length !== 6}>
              {loading ? "Please wait…" : "Verify"}
            </button>
          </form>
        )}
      </AuthLayout>
      </>
    );
  }

  return (
    <>
      {alarm}
    <AuthLayout>
      <form
        className={loginCardClass()}
        onSubmit={onLoginSubmit}
        onAnimationEnd={onCardShakeEnd}
      >
        <div className="login-card-head login-card-head--center login-card-head--sign-in">
          <h1>Sign In</h1>
          <p>{portalSubtitle}</p>
        </div>

        {resetSuccess ? (
          <div className="banner banner-ok">
            Password updated. You can sign in with your new password.
          </div>
        ) : null}

        <div className="login-fields">
          <AuthField
            id="email"
            label="Email Address"
            value={email}
            onChange={setEmail}
            type="email"
            icon="mail"
            placeholder="Name@company.com"
            disabled={loading}
            autoComplete="email"
            required
          />
          <AuthField
            id="password"
            label="Password"
            value={password}
            onChange={setPassword}
            type="password"
            icon="lock"
            placeholder="Enter your password"
            showToggle
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword((current) => !current)}
            disabled={loading}
            autoComplete="current-password"
            required
          />
        </div>

        <div className="login-options">
          <label className="login-remember">
            <input
              type="checkbox"
              checked={rememberDevice}
              onChange={(event) => setRememberDevice(event.target.checked)}
              disabled={loading}
            />
            <span>Remember device</span>
          </label>
          <button type="button" className="login-text-link" onClick={goToForgot}>
            Forgot password?
          </button>
        </div>

        <button className="login-submit" type="submit" disabled={loading}>
          {loading ? "Please wait…" : "Sign In"}
        </button>
      </form>
    </AuthLayout>
    </>
  );
}
