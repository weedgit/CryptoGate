import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  titleId: string;
  title: string;
  /** Option being switched to, shown as a highlighted chip. */
  subject?: string;
  confirmLabel?: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children: ReactNode;
};

/** Settlement setting switch confirm, in the shared confirm pop-up style (warn tone). */
export function ConfirmChangeDialog({
  titleId,
  title,
  subject,
  confirmLabel = "Confirm",
  busy,
  onCancel,
  onConfirm,
  children,
}: Props) {
  const descId = `${titleId}-desc`;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  return createPortal(
    <div
      className="b3-commission-modal-backdrop confirm-action-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="b3-commission-modal confirm-action-modal is-warn"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        aria-busy={busy}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-action-modal__body">
          <span className="confirm-action-modal__icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.3 7.5 9.5 4.4-1.2 7.5-5.1 7.5-9.5V6L12 3Z" />
              <path d="M12 8.5v4.5" />
              <path d="M12 16.2h.01" />
            </svg>
          </span>
          <div className="confirm-action-modal__copy">
            <h3 id={titleId}>{title}</h3>
            {subject ? <span className="confirm-action-modal__subject">{subject}</span> : null}
            <p id={descId}>{children}</p>
          </div>
        </div>
        <footer className="confirm-action-modal__foot">
          <button
            type="button"
            className="confirm-action-modal__cancel"
            onClick={onCancel}
            disabled={busy}
            autoFocus
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirm-action-modal__confirm"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Saving…" : confirmLabel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
