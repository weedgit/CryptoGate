import { FormEvent, useState } from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "../auth/AuthToast";
import { MfaStepUpModal } from "../auth/MfaStepUpModal";
import {
  ApiError,
  applyComplianceOverride,
  type ComplianceOverrideType,
  type ComplianceReasonCode,
  type OrgAccount,
} from "./api";

type Props = {
  org: OrgAccount;
  canApply: boolean;
  /** Modal dialog (legacy) or embedded panel on Compliance tab. */
  variant?: "modal" | "inline";
  onClose?: () => void;
  onApplied: (result: { org?: OrgAccount }) => void;
};

const REASONS: { value: ComplianceReasonCode; label: string }[] = [
  { value: "manual_review", label: "Manual review required" },
  { value: "suspicious_activity", label: "Suspicious activity" },
  { value: "sanctions_screening", label: "Sanctions screening" },
  { value: "other", label: "Other (see notes)" },
];

const TYPES: { value: ComplianceOverrideType; label: string }[] = [
  { value: "suspend_merchant", label: "Suspend merchant account" },
  { value: "suspend_order_create", label: "Suspend payment order create" },
  { value: "matching_mode", label: "Override matching mode" },
  { value: "settlement_address", label: "Override settlement address" },
];

type PendingOverride = {
  overrideType: ComplianceOverrideType;
  reasonCode: ComplianceReasonCode;
  notes: string;
  ticketId?: string;
  matchingMode?: "B" | "C" | "D" | "S";
  settlement?: { asset: string; network: string; address: string };
};

/** B7 — Compliance override form (modal or inline on Compliance tab). */
export function ComplianceOverrideModal({
  org,
  canApply,
  variant = "modal",
  onClose,
  onApplied,
}: Props) {
  const [overrideType, setOverrideType] =
    useState<ComplianceOverrideType>("suspend_merchant");
  const [reasonCode, setReasonCode] =
    useState<ComplianceReasonCode>("manual_review");
  const [notes, setNotes] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [matchingMode, setMatchingMode] = useState<"B" | "C" | "D" | "S">("B");
  const [settlementAsset, setSettlementAsset] = useState("USDT");
  const [settlementNetwork, setSettlementNetwork] = useState("tron");
  const [settlementAddress, setSettlementAddress] = useState("");
  const [pendingMfa, setPendingMfa] = useState<PendingOverride | null>(null);
  const [busy, setBusy] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const inline = variant === "inline";

  const submitLabel =
    overrideType === "suspend_merchant" || overrideType === "suspend_order_create"
      ? "Override & Suspend"
      : "Apply override";

  function resetForm() {
    setOverrideType("suspend_merchant");
    setReasonCode("manual_review");
    setNotes("");
    setTicketId("");
    setMatchingMode("B");
    setSettlementAsset("USDT");
    setSettlementNetwork("tron");
    setSettlementAddress("");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canApply || busy) return;
    setError(null);
    setDoneMsg(null);
    setPulse(true);
    window.setTimeout(() => setPulse(false), 400);
    setPendingMfa({
      overrideType,
      reasonCode,
      notes: notes.trim(),
      ticketId: ticketId.trim() || undefined,
      matchingMode: overrideType === "matching_mode" ? matchingMode : undefined,
      settlement:
        overrideType === "settlement_address"
          ? {
              asset: settlementAsset.trim(),
              network: settlementNetwork.trim(),
              address: settlementAddress.trim(),
            }
          : undefined,
    });
  }

  async function verifyMfa(mfaCode: string) {
    if (!pendingMfa) return;
    setBusy(true);
    try {
      const result = await applyComplianceOverride(org.id, {
        ...pendingMfa,
        mfaCode,
      });
      onApplied({ org: result.org });
      setPendingMfa(null);
      resetForm();
      if (inline) {
        setDoneMsg("Override applied and logged.");
      } else {
        onClose?.();
      }
    } catch (err) {
      throw new Error(
        err instanceof ApiError
          ? err.message
          : "Override failed — check MFA and try again",
      );
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <form
      className={`b7-override-modal${inline ? " b7-override-modal--inline" : ""}${pulse ? " is-pulse" : ""}`}
      role={inline ? undefined : "dialog"}
      aria-modal={inline ? undefined : true}
      aria-labelledby="b7-override-title"
      onClick={inline ? undefined : (e) => e.stopPropagation()}
      onSubmit={onSubmit}
    >
      <header className="b7-override-modal__head">
        <div className="b7-override-modal__icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <path
              d="M12 3 5 6v5c0 4.5 2.9 8.1 7 9.5 4.1-1.4 7-5 7-9.5V6l-7-3Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <path
              d="M12 8v5M12 16.5h.01"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div>
          <h2 id="b7-override-title">
            {inline ? "Apply compliance override" : "Compliance Override"}
          </h2>
          <p>
            {org.name} — this action requires MFA and will be logged permanently.
          </p>
        </div>
      </header>

      {!canApply ? (
        <p className="b7-override-modal__readonly">
          Viewer accounts can review overrides but cannot apply them.
        </p>
      ) : null}

      <label className="b7-override-modal__field">
        <span>Select override type</span>
        <select
          value={overrideType}
          disabled={!canApply || busy || Boolean(pendingMfa)}
          onChange={(e) =>
            setOverrideType(e.target.value as ComplianceOverrideType)
          }
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className="b7-override-modal__field">
        <span>Select reason for override</span>
        <select
          value={reasonCode}
          disabled={!canApply || busy || Boolean(pendingMfa)}
          onChange={(e) =>
            setReasonCode(e.target.value as ComplianceReasonCode)
          }
        >
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label className="b7-override-modal__field">
        <span>Justification notes</span>
        <textarea
          rows={4}
          required
          minLength={8}
          maxLength={2000}
          disabled={!canApply || busy || Boolean(pendingMfa)}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Suspicious activity flagged via watch node. Temporarily suspending settlement gateway…"
        />
      </label>

      <label className="b7-override-modal__field">
        <span>Ticket / case ID (optional)</span>
        <input
          type="text"
          maxLength={120}
          disabled={!canApply || busy || Boolean(pendingMfa)}
          value={ticketId}
          onChange={(e) => setTicketId(e.target.value)}
          placeholder="CASE-1042"
        />
      </label>

      {overrideType === "matching_mode" ? (
        <label className="b7-override-modal__field">
          <span>Matching mode</span>
          <select
            value={matchingMode}
            disabled={!canApply || busy || Boolean(pendingMfa)}
            onChange={(e) =>
              setMatchingMode(e.target.value as "B" | "C" | "D" | "S")
            }
          >
            <option value="B">Standard</option>
            <option value="C">Amount fingerprint</option>
            <option value="D">Memo tag</option>
            <option value="S">Smart address</option>
          </select>
        </label>
      ) : null}

      {overrideType === "settlement_address" ? (
        <div className="b7-override-modal__settlement">
          <label className="b7-override-modal__field">
            <span>Asset</span>
            <input
              value={settlementAsset}
              disabled={!canApply || busy || Boolean(pendingMfa)}
              onChange={(e) => setSettlementAsset(e.target.value)}
              required
            />
          </label>
          <label className="b7-override-modal__field">
            <span>Network</span>
            <input
              value={settlementNetwork}
              disabled={!canApply || busy || Boolean(pendingMfa)}
              onChange={(e) => setSettlementNetwork(e.target.value)}
              required
            />
          </label>
          <label className="b7-override-modal__field b7-override-modal__field--full">
            <span>Settlement address</span>
            <input
              value={settlementAddress}
              disabled={!canApply || busy || Boolean(pendingMfa)}
              onChange={(e) => setSettlementAddress(e.target.value)}
              required
              minLength={8}
              placeholder="Merchant-controlled receive address"
            />
          </label>
        </div>
      ) : null}

      <footer className="b7-override-modal__footer">
        {!inline && onClose ? (
          <button
            type="button"
            className="b7-override-modal__cancel"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
        ) : (
          <span className="b7-override-modal__footer-spacer" />
        )}
        <button
          type="submit"
          className="b7-override-modal__submit"
          disabled={
            !canApply || busy || notes.trim().length < 8 || Boolean(pendingMfa)
          }
        >
          {submitLabel}
        </button>
      </footer>
    </form>
  );

  const mfa =
    pendingMfa != null ? (
      <MfaStepUpModal
        onClose={() => setPendingMfa(null)}
        onVerify={verifyMfa}
      />
    ) : null;

  if (inline) {
    return (
      <>
        <AuthToast
          message={error}
          tone="error"
          onDismiss={() => setError(null)}
        />
        <AuthToast
          message={doneMsg}
          tone="ok"
          onDismiss={() => setDoneMsg(null)}
        />
        {form}
        {mfa && createPortal(mfa, document.body)}
      </>
    );
  }

  return createPortal(
    <>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <div
        className="b7-override-backdrop"
        role="presentation"
        onClick={() => {
          if (!busy && !pendingMfa) onClose?.();
        }}
      >
        {form}
      </div>
      {mfa}
    </>,
    document.body,
  );
}
