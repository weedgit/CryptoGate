import { useState, type Dispatch, type SetStateAction } from "react";
import { setOrgStatus, type OrgAccount } from "../orgApi";
import { orgListErrorText } from "./orgListState";

type Options = {
  canManageRow: (row: OrgAccount) => boolean;
  setOrgs: Dispatch<SetStateAction<OrgAccount[]>>;
  invalidate: () => void;
  showOk: (text: string) => void;
  showErr: (text: string) => void;
  clearMessages: () => void;
  /** Toast verb after pausing, e.g. "Suspended" or "Paused". */
  pausedVerb: string;
};

/** Pause / resume an org from a list page, plus the suspend-reason modal state. */
export function useOrgStatusActions({
  canManageRow,
  setOrgs,
  invalidate,
  showOk,
  showErr,
  clearMessages,
  pausedVerb,
}: Options) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<OrgAccount | null>(null);
  const [suspendError, setSuspendError] = useState<string | null>(null);

  async function onSetStatus(
    row: OrgAccount,
    status: "active" | "paused",
    opts?: { reason?: string; mfaCode?: string },
  ): Promise<string | null> {
    if (!canManageRow(row)) return "Not allowed";
    setBusyId(row.id);
    clearMessages();
    try {
      await setOrgStatus(row.id, status, {
        reason: opts?.reason,
        mfaCode: opts?.mfaCode,
      });
      invalidate();
      setOrgs((prev) =>
        prev.map((o) =>
          o.id === row.id
            ? {
                ...o,
                status,
                statusReason: status === "paused" ? opts?.reason ?? null : null,
              }
            : o,
        ),
      );
      showOk(status === "paused" ? `${pausedVerb} ${row.name}.` : `Resumed ${row.name}.`);
      return null;
    } catch (err) {
      const text = orgListErrorText(err, "Status update failed");
      showErr(text);
      return text;
    } finally {
      setBusyId(null);
    }
  }

  async function confirmSuspend(reason: string, mfaCode?: string) {
    if (!suspendTarget) return;
    setSuspendError(null);
    const err = await onSetStatus(suspendTarget, "paused", {
      reason: reason || undefined,
      mfaCode,
    });
    if (err) setSuspendError(err);
    else setSuspendTarget(null);
  }

  function closeSuspend() {
    if (suspendTarget && busyId === suspendTarget.id) return;
    setSuspendTarget(null);
    setSuspendError(null);
  }

  return {
    busyId,
    onSetStatus,
    suspendTarget,
    setSuspendTarget,
    suspendError,
    confirmSuspend,
    closeSuspend,
  };
}

export type OrgStatusActions = ReturnType<typeof useOrgStatusActions>;
