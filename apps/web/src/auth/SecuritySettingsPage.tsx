import { useState } from "react";
import { Link } from "react-router-dom";
import { type Session } from "../merchant/api";
import { MfaEnrollmentWizard } from "./MfaEnrollmentWizard";
import { sessionCanEnrollMfa } from "./mfaSession";

type Props = {
  session: Session;
  /** Visual shell: platform uses plat-settings cards; others use merchant panels. */
  variant?: "platform" | "agent" | "merchant";
  onSessionRefresh?: (session: Session) => void;
};

export function SecuritySettingsPage({
  session,
  variant = "merchant",
  onSessionRefresh,
}: Props) {
  const canEnroll = sessionCanEnrollMfa(session);
  const enrolled = session.mfaEnrolled === true;
  const [wizardOpen, setWizardOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (wizardOpen) {
    return (
      <div className="auth-flow-overlay">
        <MfaEnrollmentWizard
          onCancel={() => setWizardOpen(false)}
          onComplete={() => {
            setWizardOpen(false);
            setMessage("MFA enabled. You will need your authenticator on next sign-in.");
            onSessionRefresh?.({ ...session, mfaEnrolled: true });
          }}
        />
      </div>
    );
  }

  if (variant === "platform") {
    return (
      <div className="plat-settings">
        <header className="plat-settings__head">
          <div>
            <h2 className="plat-settings__title">Security</h2>
            <p className="plat-settings__subtitle">
              Personal multi-factor authentication for your operator account.
            </p>
          </div>
        </header>

        {message ? (
          <p className="plat-settings__flash" role="status">
            {message}
          </p>
        ) : null}

        <section className="plat-settings__card" style={{ maxWidth: 560 }}>
          <h3 className="plat-settings__card-title">Multi-factor authentication</h3>
          <div className="plat-settings__row">
            <div className="plat-settings__row-copy">
              <p className="plat-settings__row-label">Status</p>
              <p className="plat-settings__row-hint">
                TOTP authenticator (Google Authenticator, 1Password, etc.).
                Required for Owner and Administrator; used for settlement, xPub,
                and compliance step-up.
              </p>
            </div>
            <span
              className={`plat-team__mfa${enrolled ? " is-on" : " is-pending"}`}
            >
              <span className="plat-team__mfa-dot" aria-hidden />
              {enrolled ? "MFA ENABLED" : "MFA PENDING"}
            </span>
          </div>

          {!canEnroll ? (
            <p className="plat-settings__card-note">
              Only Owner or Administrator may enroll MFA for this account.
            </p>
          ) : enrolled ? (
            <p className="plat-settings__card-note">
              MFA is enabled. You will be challenged with a 6-digit code on each
              sign-in.
            </p>
          ) : (
            <button
              type="button"
              className="plat-settings__save"
              onClick={() => {
                setMessage(null);
                setWizardOpen(true);
              }}
            >
              Start MFA enrollment
            </button>
          )}

          <p className="plat-settings__card-note" style={{ marginTop: 16 }}>
            Org-wide MFA policy and session timeout live under{" "}
            <Link className="plat-settings__link" to="/platform/settings">
              Global settings
            </Link>
            .
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="panel settings-panel">
        <h2>Multi-factor authentication</h2>
        <p className="muted">
          TOTP authenticator (Google Authenticator, 1Password, etc.). Required for
          Owner and Administrator. Once enabled, settlement and xPub changes need
          a verification code.
        </p>

        <p className="settings-mfa-status" role="status">
          Status:{" "}
          <strong className={enrolled ? "ok" : ""}>
            {enrolled ? "Enabled" : "Not enrolled"}
          </strong>
        </p>

        {message ? <p className="banner banner-ok">{message}</p> : null}

        {!canEnroll ? (
          <p className="muted">
            Only Owner or Administrator may enroll MFA for this account.
          </p>
        ) : enrolled ? (
          <p className="muted">
            MFA is enabled. You will need your authenticator on next sign-in.
          </p>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setMessage(null);
              setWizardOpen(true);
            }}
          >
            Start MFA enrollment
          </button>
        )}
      </div>
    </div>
  );
}
