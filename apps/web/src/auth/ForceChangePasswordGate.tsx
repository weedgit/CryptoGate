import { FormEvent, useState } from "react";
import { ApiError, changePassword, type Session } from "../merchant/api";
import { AuthField } from "./AuthField";
import { AuthLayout } from "./AuthLayout";
import { AuthToast } from "./AuthToast";
import { evaluatePasswordPolicy, passwordPolicyLabel } from "./passwordPolicy";

type Props = {
  onChanged: (session: Session) => void;
};

/** Blocks portal until mustChangePassword is cleared. */
export function ForceChangePasswordGate({ onChanged }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
    <>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <AuthLayout>
        <form className="login-card" onSubmit={onSubmit}>
          <div className="login-card-head">
            <h1>Change password</h1>
          </div>
          <div className="login-fields">
            <AuthField
              id="force-current-password"
              label="Current / temporary password"
              value={currentPassword}
              onChange={setCurrentPassword}
              type="password"
              icon="lock"
              showToggle
              showPassword={showCurrent}
              onTogglePassword={() => setShowCurrent((v) => !v)}
              disabled={loading}
              autoComplete="current-password"
              required
            />
            <AuthField
              id="force-new-password"
              label="New password"
              value={newPassword}
              onChange={setNewPassword}
              type="password"
              icon="lock"
              showToggle
              showPassword={showNew}
              onTogglePassword={() => setShowNew((v) => !v)}
              disabled={loading}
              autoComplete="new-password"
              required
            />
            <AuthField
              id="force-confirm-password"
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              type="password"
              icon="lock"
              showToggle
              showPassword={showConfirm}
              onTogglePassword={() => setShowConfirm((v) => !v)}
              disabled={loading}
              autoComplete="new-password"
              required
            />
          </div>
          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? "Saving…" : "Save password"}
          </button>
        </form>
      </AuthLayout>
    </>
  );
}
