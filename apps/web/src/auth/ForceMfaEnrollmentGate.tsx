import { getSession, type Session } from "../merchant/api";
import { MfaEnrollmentWizard } from "./MfaEnrollmentWizard";
import { productLineFromPortal } from "./productLine";

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
    <MfaEnrollmentWizard
      cancelable={false}
      productLine={productLineFromPortal(portalLabel)}
      notice={
        <>
          <strong>Two-factor authentication required</strong>
          <span>Owner and Administrator accounts must enroll ({session.email}).</span>
        </>
      }
      onCancel={() => undefined}
      onComplete={() => {
        void getSession()
          .then(onEnrolled)
          .catch(() => {
            onEnrolled({ ...session, mfaEnrolled: true });
          });
      }}
    />
  );
}
