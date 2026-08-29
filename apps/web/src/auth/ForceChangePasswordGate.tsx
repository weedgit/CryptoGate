import { FormEvent, useState } from "react";
import { ApiError, changePassword, type Session } from "../merchant/api";
import { AuthToast } from "./AuthToast";
import { evaluatePasswordPolicy, passwordPolicyLabel } from "./passwordPolicy";

type Props = {
  session: Session;
  portalLabel: string;
  onChanged: (session: Session) => void;
};

/** Blocks portal until mustChangePassword is cleared. */
export function ForceChangePasswordGate({ session, portalLabel, onChanged }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const policy = evaluatePasswordPolicy(newPassword);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!policy.valid) {
      setError(passwordPolicyLabel());
      return;
    }
    setLoading(true);
    try {
      const next = await changePassword({ currentPassword, newPassword });
      onChanged(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Password change failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <form className="login-card" onSubmit={onSubmit}>
        <h1>Change password</h1>
        <p className="muted">
          {portalLabel}: you must set a new password before continuing ({session.email}).
        </p>
        <label className="settings-filter">
          <span>Current / temporary password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>
        <label className="settings-filter">
          <span>New password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        <label className="settings-filter">
          <span>Confirm new password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Saving…" : "Save password"}
        </button>
      </form>
    </div>
  );
}
