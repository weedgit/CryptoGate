import { formatViewerDateTime } from "../shared/dateTime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PLATFORM_FEE_ASSET } from "@paymentgate/domain";
import { AuthToast } from "../auth/AuthToast";
import { MfaStepUpGate } from "../auth/MfaStepUpGate";
import { OrgProfileEditModal } from "../shared/OrgProfileEditModal";
import { platformFeeNetwork } from "../shared/platformFeePair";
import { getAgentOrgs, peekAgentOrgs, refreshAgentOrgList } from "./agentOrgList";
import {
  ApiError,
  getAgentPayout,
  getSession,
  patchOrgProfile,
  putAgentPayout,
  type AgentPayoutAddress,
  type OrgAccount,
  type Session,
} from "./api";
import { orgTypeLabel, primaryAgentOrgId, sessionCanOnboardMerchant } from "./org";

type OrgEditSave = Parameters<Parameters<typeof OrgProfileEditModal>[0]["onSave"]>[0];

type Props = {
  session: Session;
  open: boolean;
  onClose: () => void;
  onSessionRefresh?: (session: Session) => void;
};

/**
 * Agent organization settings as a window (replaces the old Settings page):
 * profile + commission payout wallet. Viewers get a read-only view.
 */
export function AgentOrgEditHost({ session, open, onClose, onSessionRefresh }: Props) {
  const agentId = useMemo(() => primaryAgentOrgId(session), [session]);
  const canEdit = useMemo(() => sessionCanOnboardMerchant(session), [session]);

  const [org, setOrg] = useState<OrgAccount | null>(null);
  const [payout, setPayout] = useState<AgentPayoutAddress | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "error" } | null>(null);
  const [pendingPayoutSave, setPendingPayoutSave] = useState<OrgEditSave | null>(null);

  useEffect(() => {
    if (!open || !agentId) return;
    let cancelled = false;
    setError(null);
    setOrg(peekAgentOrgs()?.find((o) => o.id === agentId) ?? null);
    setLoaded(false);
    void Promise.all([
      getAgentOrgs({ force: true }),
      getAgentPayout(agentId).catch(() => null),
    ])
      .then(([orgs, payoutRow]) => {
        if (cancelled) return;
        setOrg(orgs.find((o) => o.id === agentId) ?? null);
        setPayout(payoutRow);
        setLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setToast({
          message: err instanceof ApiError ? err.message : "Failed to load organization",
          tone: "error",
        });
        onClose();
      });
    return () => {
      cancelled = true;
    };
  }, [open, agentId, onClose]);

  const close = useCallback(() => {
    if (busy) return;
    setPendingPayoutSave(null);
    onClose();
  }, [busy, onClose]);

  async function save(next: OrgEditSave, mfaCode?: string) {
    if (!agentId) return;
    setBusy(true);
    setError(null);
    try {
      let payoutMsg: string | null = null;
      if (mfaCode && next.payoutAddress?.trim()) {
        const row = await putAgentPayout(agentId, {
          asset: PLATFORM_FEE_ASSET,
          network: platformFeeNetwork(),
          address: next.payoutAddress.trim(),
          mfaCode,
        });
        setPayout(row);
        payoutMsg = row.pendingActivatesAt
          ? `Payout wallet change pending. Activates ${formatViewerDateTime(row.pendingActivatesAt)}.`
          : "Payout wallet saved.";
      }
      const updated = await patchOrgProfile(agentId, next);
      setOrg(updated);
      await refreshAgentOrgList();
      if (onSessionRefresh) onSessionRefresh(await getSession());
      setToast({ message: payoutMsg ?? "Organization saved.", tone: "ok" });
      setPendingPayoutSave(null);
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save organization";
      if (mfaCode) throw new Error(message);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  const payoutNote = payout?.pendingActivatesAt
    ? `Pending change to ${payout.pendingAddress ?? "a new wallet"} activates ${formatViewerDateTime(payout.pendingActivatesAt)}. Payouts go to the current wallet until then.`
    : null;

  return (
    <>
      <AuthToast
        message={toast?.message ?? null}
        tone={toast?.tone ?? "ok"}
        onDismiss={() => setToast(null)}
      />
      <OrgProfileEditModal
        open={open && loaded && org != null}
        name={org?.name ?? ""}
        iconKey={org?.iconKey}
        country={org?.country}
        legalName={org?.legalName}
        billingEmail={org?.billingEmail}
        requireCountry={false}
        typeLabel={org ? orgTypeLabel(org.type) : "Agent"}
        payoutAddress={payout?.address ?? ""}
        payoutNote={payoutNote}
        readOnly={!canEdit}
        busy={busy}
        error={error}
        onClose={close}
        onSave={async (next) => {
          const prev = (payout?.address ?? "").trim();
          const nextAddr = (next.payoutAddress ?? "").trim();
          if (nextAddr && nextAddr !== prev) {
            setPendingPayoutSave({ ...next, payoutAddress: nextAddr });
            return;
          }
          await save(next);
        }}
      />
      {pendingPayoutSave ? (
        <MfaStepUpGate
          session={session}
          actionLabel="save commission payout address"
          onClose={() => {
            if (!busy) setPendingPayoutSave(null);
          }}
          onVerify={(mfaCode) => save(pendingPayoutSave, mfaCode)}
        />
      ) : null}
    </>
  );
}
