import { useEffect, useMemo, useState } from "react";
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

function DeleteWarningIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 6.25v4.5M10 14.25h.01"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M3.2 16.5h13.6L10 3.5 3.2 16.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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

  const nestedSummary = useMemo(() => {
    if (childOrgs.length === 0) return null;
    const shown = childOrgs.slice(0, 4);
    const names = shown.map((o) => o.name).join(", ");
    const extra = childOrgs.length - shown.length;
    return extra > 0 ? `${names}, and ${extra} more` : names;
  }, [childOrgs]);

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
          className="b3-commission-modal org-delete-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="org-delete-title"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="b3-commission-modal__head org-delete-modal__head">
            <div className="org-delete-modal__title-row">
              <span className="org-delete-modal__icon">
                <DeleteWarningIcon />
              </span>
              <h3 id="org-delete-title">Delete org account</h3>
            </div>
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

          <div className="b3-commission-modal__body org-delete-modal__body">
            <div className="org-delete-modal__banner" role="note">
              <p>
                Deleting <strong>{orgName}</strong> permanently removes nested
                orgs, team members, payment orders, service bills, API keys, and
                webhooks. This action cannot be undone.
              </p>
            </div>

            {previewLoading ? (
              <p className="org-delete-modal__loading muted">Calculating impact…</p>
            ) : preview ? (
              <dl className="org-delete-modal__stats" aria-label="Deletion impact">
                <div>
                  <dt>Orgs</dt>
                  <dd>
                    {preview.orgCount}
                    {preview.childOrgCount > 0 ? (
                      <span className="org-delete-modal__stat-note">
                        {" "}
                        ({preview.childOrgCount} nested)
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt>Members</dt>
                  <dd>{preview.memberCount}</dd>
                </div>
                <div>
                  <dt>Orders</dt>
                  <dd>{preview.orderCount}</dd>
                </div>
                <div>
                  <dt>Bills</dt>
                  <dd>{preview.billCount}</dd>
                </div>
              </dl>
            ) : null}

            {nestedSummary ? (
              <p className="org-delete-modal__nested">Includes {nestedSummary}.</p>
            ) : null}

            <div className="org-delete-modal__checks">
              <label className="org-delete-modal__ack">
                <input
                  type="checkbox"
                  checked={ack}
                  disabled={busy}
                  onChange={(e) => setAck(e.target.checked)}
                />
                <span>
                  I understand this permanently removes all nested orgs and members.
                </span>
              </label>

              <label className="b3-commission-modal__field org-delete-modal__confirm-field">
                <span className="b3-commission-modal__label">Confirm org name</span>
                <div className="b3-commission-modal__input-wrap org-delete-modal__input-wrap">
                  <input
                    className="b3-commission-modal__input"
                    value={confirmName}
                    disabled={busy}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={orgName}
                    aria-invalid={confirmName.length > 0 && !nameOk}
                    onChange={(e) => setConfirmName(e.target.value)}
                  />
                </div>
                <span className="org-delete-modal__match-hint">
                  Type <strong>{orgName}</strong> exactly to enable deletion.
                </span>
              </label>
            </div>
          </div>

          <footer className="b3-commission-modal__foot org-delete-modal__foot">
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
              className="org-delete-modal__confirm"
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
