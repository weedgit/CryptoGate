import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ConfirmTone = "danger" | "warn";

export type ConfirmRequest = {
  title: string;
  message: ReactNode;
  /** Name of the thing affected, shown as a highlighted chip. */
  subject?: string;
  confirmLabel: string;
  tone?: ConfirmTone;
};

type Props = ConfirmRequest & {
  onConfirm: () => void;
  onCancel: () => void;
};

/** Project-style replacement for window.confirm on destructive actions. */
export function ConfirmActionModal({
  title,
  message,
  subject,
  confirmLabel,
  tone = "danger",
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return createPortal(
    <div className="b3-commission-modal-backdrop confirm-action-backdrop" role="presentation" onClick={onCancel}>
      <div
        className={`b3-commission-modal confirm-action-modal is-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-action-modal__body">
          <span className="confirm-action-modal__icon" aria-hidden>
            {tone === "danger" ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
                <path d="M4 4v4h4" />
                <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
                <path d="M20 20v-4h-4" />
              </svg>
            )}
          </span>
          <div className="confirm-action-modal__copy">
            <h3 id={titleId}>{title}</h3>
            {subject ? <span className="confirm-action-modal__subject mono">{subject}</span> : null}
            <p id={descId}>{message}</p>
          </div>
        </div>
        <footer className="confirm-action-modal__foot">
          <button type="button" className="confirm-action-modal__cancel" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button type="button" className="confirm-action-modal__confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
