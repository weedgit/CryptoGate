import { createPortal } from "react-dom";

type Props = {
  message: string | null;
  onOpen: () => void;
  onDismiss: () => void;
};

/** Bottom-right login summary for unread alerts (A9 companion). */
export function AlertSummaryToast({ message, onOpen, onDismiss }: Props) {
  if (!message) return null;

  return createPortal(
    <div className="alert-summary-toast-stack" role="region" aria-label="Alerts summary">
      <div className="cg-toast cg-toast--warn alert-summary-toast">
        <button type="button" className="alert-summary-toast__open" onClick={onOpen}>
          <span className="cg-toast__body">{message}</span>
          <span className="alert-summary-toast__hint">Open alerts</span>
        </button>
        <button
          type="button"
          className="alert-summary-toast__dismiss"
          aria-label="Dismiss alert summary"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
    </div>,
    document.body,
  );
}
