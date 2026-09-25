import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  count: number;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (opts: { note: string; txRef: string }) => void;
};

/** Shared note + optional txRef for batch Confirm & pay on issued invoices. */
export function BulkMarkPaidModal({
  open,
  count,
  busy = false,
  error = null,
  onClose,
  onConfirm,
}: Props) {
  const [note, setNote] = useState("");
  const [txRef, setTxRef] = useState("");

  useEffect(() => {
    if (!open) return;
    setNote("");
    setTxRef("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const canSubmit = note.trim().length > 0 && !busy;

  return createPortal(
    <div
      className="b3-commission-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="b3-commission-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-mark-paid-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="b3-commission-modal__head">
          <h2 id="bulk-mark-paid-title" className="b3-commission-modal__title">
            Confirm &amp; pay ({count})
          </h2>
          <button
            type="button"
            className="b3-commission-modal__close"
            disabled={busy}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="b3-commission-modal__body">
          <p className="muted" style={{ marginTop: 0 }}>
            Marks selected issued invoices as paid (awaiting agent confirm). The
            same note and optional tx hash apply to every row.
          </p>
          <label className="plat-commissions-slip__confirm-note">
            <span className="plat-commissions-slip__label">
              Tx hash / payment ref{" "}
              <span className="plat-commissions-slip__optional">(optional)</span>
            </span>
            <input
              className="field-control plat-commissions-slip__note-input"
              type="text"
              value={txRef}
              onChange={(e) => setTxRef(e.target.value)}
              maxLength={200}
              spellCheck={false}
              autoComplete="off"
              disabled={busy}
              placeholder="On-chain tx hash or remittance reference"
            />
          </label>
          <label
            className="plat-commissions-slip__confirm-note"
            style={{ marginTop: 12 }}
          >
            <span className="plat-commissions-slip__label">
              Note{" "}
              <span className="plat-commissions-slip__optional">(required)</span>
            </span>
            <textarea
              className="field-control plat-commissions-slip__note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              disabled={busy}
              placeholder="Ops note (who remitted, treasury ticket, etc.)"
            />
          </label>
          {error ? (
            <p className="banner banner-warn" style={{ marginTop: 12 }}>
              {error}
            </p>
          ) : null}
        </div>
        <footer
          className="b3-commission-modal__foot"
          style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
        >
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canSubmit}
            onClick={() =>
              onConfirm({ note: note.trim(), txRef: txRef.trim() })
            }
          >
            {busy ? "Saving…" : `Confirm & pay ${count}`}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
