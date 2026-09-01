import type { Session } from "../merchant/api";
import { MfaEnrollRequiredModal } from "./MfaEnrollRequiredModal";
import { MfaStepUpModal, type MfaStepUpModalProps } from "./MfaStepUpModal";
import { sessionCanEnrollMfa, sessionMfaEnrolled } from "./mfaSession";

export type MfaStepUpGateProps = MfaStepUpModalProps & {
  session: Session;
  /** Short label for the protected action, e.g. "save settlement address". */
  actionLabel?: string;
};

/**
 * Privileged-action MFA: prompt enrollment when TOTP is missing,
 * otherwise show the standard step-up code entry modal.
 */
export function MfaStepUpGate({
  session,
  actionLabel,
  ...stepUp
}: MfaStepUpGateProps) {
  if (!sessionMfaEnrolled(session)) {
    return (
      <MfaEnrollRequiredModal
        onClose={stepUp.onClose}
        actionLabel={actionLabel}
        canEnroll={sessionCanEnrollMfa(session)}
        enrollmentPending={session.mfaEnrollmentPending === true}
      />
    );
  }
  return <MfaStepUpModal {...stepUp} />;
}
