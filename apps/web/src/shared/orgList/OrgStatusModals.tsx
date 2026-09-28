import { MfaStepUpGate } from "../../auth/MfaStepUpGate";
import type { Session } from "../../merchant/api";
import { OrgDeleteConfirmModal } from "../../platform/ui/OrgDeleteConfirmModal";
import { SuspendOrgModal } from "../../platform/ui/SuspendOrgModal";
import type { OrgAccount } from "../orgApi";
import type { useOrgDeleteModal } from "./useOrgDeleteModal";
import type { OrgStatusActions } from "./useOrgStatusActions";

type Props = {
  session: Session;
  status: OrgStatusActions;
  deletion: ReturnType<typeof useOrgDeleteModal>;
  /** Server enforces MFA on status changes only for platform operators. */
  requireMfa?: boolean;
  /** When set, resuming goes through an MFA step-up for this org. */
  resumeTarget?: OrgAccount | null;
  onCloseResume?: () => void;
};

/** Suspend / MFA resume / delete dialogs shared by org list pages. */
export function OrgStatusModals({
  session,
  status,
  deletion,
  requireMfa,
  resumeTarget,
  onCloseResume,
}: Props) {
  const { suspendTarget, busyId } = status;
  return (
    <>
      {suspendTarget ? (
        <SuspendOrgModal
          orgName={suspendTarget.name}
          session={session}
          requireMfa={requireMfa}
          busy={busyId === suspendTarget.id}
          error={status.suspendError}
          onClose={status.closeSuspend}
          onConfirm={(reason, mfaCode) => void status.confirmSuspend(reason, mfaCode)}
        />
      ) : null}

      {resumeTarget && onCloseResume ? (
        <MfaStepUpGate
          session={session}
          actionLabel="resume this account"
          onClose={onCloseResume}
          onVerify={async (mfaCode) => {
            const err = await status.onSetStatus(resumeTarget, "active", { mfaCode });
            if (err) throw new Error(err);
            onCloseResume();
          }}
        />
      ) : null}

      {deletion.deleteTarget ? (
        <OrgDeleteConfirmModal
          orgId={deletion.deleteTarget.id}
          orgName={deletion.deleteTarget.name}
          busy={deletion.deleteBusy}
          error={deletion.deleteError}
          preview={deletion.deletePreview}
          previewLoading={deletion.deletePreviewLoading}
          onClose={deletion.closeDelete}
          onConfirm={() => void deletion.confirmDelete()}
        />
      ) : null}
    </>
  );
}
