import { getSession, type Session } from "../merchant/api";
import { MfaEnrollmentWizard } from "./MfaEnrollmentWizard";

type Props = {
  session: Session;
  portalLabel: string;
  onEnrolled: (session: Session) => void;
};

/**
 * Blocks Owner/Administrator portals until MFA enrollment completes (A5).
 */
export function ForceMfaEnrollmentGate({
  session,
  portalLabel,
  onEnrolled,
}: Props) {
  return (
    <div className="auth-flow-overlay">
      <div className="mfa-force-banner" role="status">
        <strong>{portalLabel}</strong>
        <span>
          Multi-factor authentication is required for Owner and Administrator
          accounts ({session.email}).
        </span>
      </div>
      <MfaEnrollmentWizard
        cancelable={false}
        onCancel={() => undefined}
        onComplete={() => {
          void getSession()
            .then(onEnrolled)
            .catch(() => {
              onEnrolled({ ...session, mfaEnrolled: true });
            });
        }}
      />
    </div>
  );
}
