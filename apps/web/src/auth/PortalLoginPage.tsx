import { FormEvent, useState } from "react";
import { ApiError, login, verifyMfa } from "../merchant/api";

type Props = {
  portalLabel: string;
  onSignedIn: () => void;
};

export function PortalLoginPage({ portalLabel, onSignedIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaStep, setMfaStep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mfaStep) {
        await verifyMfa(mfaCode);
        onSignedIn();
        return;
      }
      const result = await login(email.trim(), password);
      if (result.mfaRequired) {
        setMfaStep(true);
        return;
      }
      onSignedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>CryptoGate</h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>{portalLabel}</p>

        {mfaStep ? (
          <>
            <div className="banner banner-warn" style={{ marginBottom: 12 }}>
              Enter the 6-digit code from your authenticator app.
            </div>
            <div className="field">
              <label htmlFor="mfa-code">MFA code</label>
              <input
                id="mfa-code"
                className="field-control"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                disabled={loading}
              />
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="field-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                disabled={loading}
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="field-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                disabled={loading}
              />
            </div>
          </>
        )}

        {error ? <p className="error">{error}</p> : null}
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Please wait…" : mfaStep ? "Verify" : "Sign in"}
        </button>
        {mfaStep ? (
          <button
            type="button"
            className="btn-secondary"
            style={{ marginTop: 8, width: "100%" }}
            disabled={loading}
            onClick={() => {
              setMfaStep(false);
              setMfaCode("");
              setError(null);
            }}
          >
            Back to password
          </button>
        ) : null}
      </form>
    </div>
  );
}
