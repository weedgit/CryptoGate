import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  orgName: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
};

export function SuspendOrgModal({
  orgName,
  busy = false,
  error = null,
  onClose,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    setReason("");
  }, [orgName]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return createPortal(
    <div
      className="b3-commission-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="b3-commission-modal b3-suspend-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="suspend-org-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="b3-commission-modal__head">
          <h3 id="suspend-org-title">Suspend account</h3>
          <button
            type="button"
            className="b3-commission-modal__close"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="b3-commission-modal__body">
          <p className="b3-commission-modal__hint">
            Suspending <strong className="b3-suspend-modal__name">{orgName}</strong>{" "}
            revokes portal access until the account is resumed. Open payment orders
            are not cancelled.
          </p>
          <label className="b3-commission-modal__field">
            <span className="b3-commission-modal__label">Reason (optional)</span>
            <textarea
              className="b3-suspend-modal__reason"
              rows={3}
              value={reason}
              disabled={busy}
              placeholder="e.g. compliance review, billing dispute, requested by agent"
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </label>
          {error ? <p className="b3-commission-modal__error">{error}</p> : null}
        </div>
        <footer className="b3-commission-modal__foot">
          <button
            type="button"
            className="b3-commission-modal__cancel"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="b3-commission-modal__save b3-suspend-modal__confirm"
            disabled={busy}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy ? "Suspending…" : "Suspend"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
