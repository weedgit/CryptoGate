import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "../../auth/AuthToast";
import type { OrgDeletePreview } from "../api";

type Props = {
  orgName: string;
  orgId: string;
  busy?: boolean;
  error?: string | null;
  preview: OrgDeletePreview | null;
  previewLoading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function OrgDeleteConfirmModal({
  orgName,
  orgId,
  busy = false,
  error = null,
  preview,
  previewLoading = false,
  onClose,
  onConfirm,
}: Props) {
  const [confirmName, setConfirmName] = useState("");
  const [ack, setAck] = useState(false);
  const [toastError, setToastError] = useState<string | null>(null);
  const nameOk = confirmName.trim() === orgName.trim();
  const canSubmit = ack && nameOk && !busy && !previewLoading;

  useEffect(() => {
    setConfirmName("");
    setAck(false);
  }, [orgId, orgName]);

  useEffect(() => {
    setToastError(error);
  }, [error]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const childOrgs =
    preview?.orgs.filter((o) => o.id !== orgId && o.depth > 0) ?? [];

  return createPortal(
    <>
      <AuthToast
        message={toastError}
        tone="error"
        onDismiss={() => setToastError(null)}
      />
      <div
        className="b3-commission-modal-backdrop"
        role="presentation"
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          className="b3-commission-modal b3-suspend-modal org-delete-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="org-delete-title"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="b3-commission-modal__head">
            <h3 id="org-delete-title">Delete org account</h3>
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
              Permanently delete{" "}
              <strong className="b3-suspend-modal__name">{orgName}</strong> and all
              nested org accounts, team memberships, payment orders, service bills,
              API keys, and webhooks under this tree. This cannot be undone.
            </p>

            {previewLoading ? (
              <p className="muted">Calculating impact…</p>
            ) : preview ? (
              <ul className="org-delete-modal__impact">
                <li>
                  <strong>{preview.orgCount}</strong> org
                  {preview.orgCount === 1 ? "" : "s"} total
                  {preview.childOrgCount > 0
                    ? ` (${preview.childOrgCount} nested)`
                    : null}
                </li>
                <li>
                  <strong>{preview.memberCount}</strong> team membership
                  {preview.memberCount === 1 ? "" : "s"}
                </li>
                <li>
                  <strong>{preview.orderCount}</strong> payment order
                  {preview.orderCount === 1 ? "" : "s"}
                </li>
                <li>
                  <strong>{preview.billCount}</strong> service bill
                  {preview.billCount === 1 ? "" : "s"}
                </li>
              </ul>
            ) : null}

            {childOrgs.length > 0 ? (
              <div className="org-delete-modal__children">
                <p className="b3-commission-modal__label">Nested orgs</p>
                <ul>
                  {childOrgs.slice(0, 8).map((o) => (
                    <li key={o.id}>
                      {o.name}{" "}
                      <span className="muted">({o.type.replace(/_/g, " ")})</span>
                    </li>
                  ))}
                  {childOrgs.length > 8 ? (
                    <li className="muted">+ {childOrgs.length - 8} more</li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            <label className="org-delete-modal__ack">
              <input
                type="checkbox"
                checked={ack}
                disabled={busy}
                onChange={(e) => setAck(e.target.checked)}
              />
              I understand this permanently removes all nested orgs and members.
            </label>

            <label className="b3-commission-modal__field">
              <span className="b3-commission-modal__label">
                Type <strong>{orgName}</strong> to confirm
              </span>
              <input
                className="b3-commission-modal__input"
                value={confirmName}
                disabled={busy}
                autoComplete="off"
                onChange={(e) => setConfirmName(e.target.value)}
              />
            </label>
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
              className="b3-commission-modal__save org-delete-modal__confirm"
              disabled={!canSubmit}
              onClick={onConfirm}
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
          </footer>
        </div>
      </div>
    </>,
    document.body,
  );
}
