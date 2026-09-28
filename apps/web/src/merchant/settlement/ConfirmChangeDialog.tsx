import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  titleId: string;
  title: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children: ReactNode;
};

export function ConfirmChangeDialog({
  titleId,
  title,
  busy,
  onCancel,
  onConfirm,
  children,
}: Props) {
  return createPortal(
    <div
      className="b3-commission-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="b3-commission-modal plat-settlement__confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="b3-commission-modal__head">
          <h3 id={titleId}>{title}</h3>
          <button
            type="button"
            className="b3-commission-modal__close"
            aria-label="Close"
            disabled={busy}
            onClick={onCancel}
          >
            ×
          </button>
        </header>
        <div className="b3-commission-modal__body">
          <p className="plat-settings__card-copy">{children}</p>
          <div className="b3-commission-modal__actions">
            <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={onConfirm} disabled={busy}>
              {busy ? "Saving…" : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
