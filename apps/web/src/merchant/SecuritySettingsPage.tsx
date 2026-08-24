import { FormEvent, useState } from "react";
import { ApiError, enrollMfa, verifyMfa, type Session } from "./api";
import { primaryMerchantOrgId, sessionRoleOnOrg } from "./org";

type Props = { session: Session };

export function SecuritySettingsPage({ session }: Props) {
  const orgId = primaryMerchantOrgId(session);
  const role = orgId ? sessionRoleOnOrg(session, orgId) : null;
  const canEnroll =
    role === "owner" || role === "administrator" || session.memberships.some(
      (m) => m.orgType === "platform" && (m.role === "owner" || m.role === "administrator"),
    );

  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onStart() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const payload = await enrollMfa();
      setSecret(payload.secret);
      setOtpauthUrl(payload.otpauthUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Enrollment failed");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyMfa(code);
      setMessage("MFA enabled. You will need your authenticator on next sign-in.");
      setSecret(null);
      setOtpauthUrl(null);
      setCode("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  if (!canEnroll) {
    return (
      <div className="panel settings-panel">
        <h2>Security</h2>
        <p className="muted">
          Only Owner or Administrator may enroll MFA for this account.
        </p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="panel settings-panel">
        <h2>Multi-factor authentication</h2>
        <p className="muted">
          TOTP authenticator (Google Authenticator, 1Password, etc.). Required for
          settlement and xPub changes once enabled.
        </p>

        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="banner banner-ok">{message}</p> : null}

        {!secret ? (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void onStart()}>
            {busy ? "Starting…" : "Start MFA enrollment"}
          </button>
        ) : (
          <form className="form-stack" onSubmit={onConfirm}>
            <div className="field">
              <span className="field-label">Manual secret</span>
              <code className="mono">{secret}</code>
            </div>
            {otpauthUrl ? (
              <div className="field">
                <span className="field-label">Setup link</span>
                <a href={otpauthUrl} className="mono" style={{ fontSize: 12, wordBreak: "break-all" }}>
                  {otpauthUrl}
                </a>
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="enroll-code">Verification code</label>
              <input
                id="enroll-code"
                className="field-control"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                required
                disabled={busy}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Verifying…" : "Confirm and enable MFA"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
