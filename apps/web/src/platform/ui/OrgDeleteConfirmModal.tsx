import { useEffect, useId, useMemo, useState } from "react";
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

function DeleteTrashIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l.8 12.2A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DeleteCloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M5 5l10 10M15 5L5 15"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DeleteAlertIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 6.5v4.25M10 13.75h.01"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatOrgsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="7.5" y="2.5" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2.5" y="13" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="12.5" y="13" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10 6.5v3.5M5 13v-3h10v3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatMembersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="7.5" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="13.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M2.75 15.5c.6-2.2 2.3-3.5 4.75-3.5s4.15 1.3 4.75 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M12.25 12.25c1.55.15 2.85 1.05 3.5 2.75"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatOrdersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M5.5 3.5h7.2L15.5 6.3V16a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 3.5V6.5H15.5M7 10h6M7 13h4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatBillsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M5 3.5h10a1 1 0 0 1 1 1V16l-2-.9-2 .9-2-.9-2 .9-2-.9-2 .9V4.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 7.5h5M7.5 10.5h5M7.5 13.5h3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
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
  const uid = useId().replace(/:/g, "");
  const gA = `delete-red-a-${uid}`;
  const gB = `delete-red-b-${uid}`;
  const gC = `delete-red-c-${uid}`;

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
          aria-describedby="org-delete-subtitle"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="org-delete-modal__head">
            <div className="org-delete-modal__aura" aria-hidden>
              <svg
                className="org-delete-modal__aura-svg"
                viewBox="0 0 640 96"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id={gA} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(248,113,113,0)" />
                    <stop offset="18%" stopColor="rgba(252,165,165,0.7)" />
                    <stop offset="45%" stopColor="rgba(248,113,113,0.45)" />
                    <stop offset="72%" stopColor="rgba(239,68,68,0.22)" />
                    <stop offset="100%" stopColor="rgba(248,113,113,0)" />
                  </linearGradient>
                  <linearGradient id={gB} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(248,113,113,0)" />
                    <stop offset="26%" stopColor="rgba(254,202,202,0.5)" />
                    <stop offset="55%" stopColor="rgba(239,68,68,0.28)" />
                    <stop offset="100%" stopColor="rgba(248,113,113,0)" />
                  </linearGradient>
                  <linearGradient id={gC} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(248,113,113,0)" />
                    <stop offset="34%" stopColor="rgba(248,113,113,0.35)" />
                    <stop offset="66%" stopColor="rgba(239,68,68,0.14)" />
                    <stop offset="100%" stopColor="rgba(248,113,113,0)" />
                  </linearGradient>
                </defs>
                <path
                  d="M80 62 C 180 58, 240 30, 340 36 C 430 42, 500 56, 580 50"
                  fill="none"
                  stroke={`url(#${gA})`}
                  strokeWidth="1.55"
                  strokeLinecap="round"
                />
                <path
                  d="M100 74 C 200 70, 260 46, 360 50 C 450 54, 510 66, 570 62"
                  fill="none"
                  stroke={`url(#${gB})`}
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  opacity="0.95"
                />
                <path
                  d="M120 50 C 210 46, 270 68, 370 62 C 460 56, 520 40, 590 44"
                  fill="none"
                  stroke={`url(#${gC})`}
                  strokeWidth="1"
                  strokeLinecap="round"
                  opacity="0.8"
                />
              </svg>
            </div>
            <div className="org-delete-modal__head-main">
              <span className="org-delete-modal__mark" aria-hidden>
                <DeleteTrashIcon size={32} />
              </span>
              <div className="org-delete-modal__titles">
                <h3 id="org-delete-title">Delete organization</h3>
                <p id="org-delete-subtitle">
                  This will permanently remove this organization.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="b3-commission-modal__close org-delete-modal__close"
              aria-label="Close"
              disabled={busy}
              onClick={onClose}
            >
              <DeleteCloseIcon />
            </button>
          </header>

          <div className="b3-commission-modal__body org-delete-modal__body">
            {previewLoading ? (
              <p className="org-delete-modal__loading muted">Calculating impact…</p>
            ) : preview ? (
              <dl className="org-delete-modal__stats" aria-label="Deletion impact">
                <div>
                  <span className="org-delete-modal__stat-icon" aria-hidden>
                    <StatOrgsIcon />
                  </span>
                  <div className="org-delete-modal__stat-copy">
                    <dt>Orgs</dt>
                    <dd>
                      {preview.orgCount}
                      {preview.childOrgCount > 0 ? (
                        <span className="org-delete-modal__stat-note">
                          {preview.childOrgCount} nested
                        </span>
                      ) : null}
                    </dd>
                  </div>
                </div>
                <div>
                  <span className="org-delete-modal__stat-icon" aria-hidden>
                    <StatMembersIcon />
                  </span>
                  <div className="org-delete-modal__stat-copy">
                    <dt>Members</dt>
                    <dd>{preview.memberCount}</dd>
                  </div>
                </div>
                <div>
                  <span className="org-delete-modal__stat-icon" aria-hidden>
                    <StatOrdersIcon />
                  </span>
                  <div className="org-delete-modal__stat-copy">
                    <dt>Orders</dt>
                    <dd>{preview.orderCount}</dd>
                  </div>
                </div>
                <div>
                  <span className="org-delete-modal__stat-icon" aria-hidden>
                    <StatBillsIcon />
                  </span>
                  <div className="org-delete-modal__stat-copy">
                    <dt>Bills</dt>
                    <dd>{preview.billCount}</dd>
                  </div>
                </div>
              </dl>
            ) : null}

            {nestedSummary ? (
              <p className="org-delete-modal__nested">Includes {nestedSummary}.</p>
            ) : null}

            <div className="org-delete-modal__checks">
              <div className="org-delete-modal__confirm-field">
                <label
                  className="org-delete-modal__confirm-label"
                  htmlFor="org-delete-confirm-name"
                >
                  Confirm organization name
                </label>
                <div className="org-delete-modal__input-wrap">
                  <input
                    id="org-delete-confirm-name"
                    className="org-delete-modal__input"
                    value={confirmName}
                    disabled={busy}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={orgName}
                    aria-invalid={confirmName.length > 0 && !nameOk}
                    onChange={(e) => setConfirmName(e.target.value)}
                  />
                </div>
              </div>

              <div className="org-delete-modal__warning">
                <div className="org-delete-modal__warning-head">
                  <span className="org-delete-modal__warning-icon" aria-hidden>
                    <DeleteAlertIcon />
                  </span>
                  <div className="org-delete-modal__warning-copy">
                    <p className="org-delete-modal__warning-title">Cannot be undone.</p>
                  </div>
                </div>
                <label className="org-delete-modal__ack">
                  <input
                    type="checkbox"
                    checked={ack}
                    disabled={busy}
                    onChange={(e) => setAck(e.target.checked)}
                  />
                  <span>I understand this is permanent.</span>
                </label>
              </div>
            </div>
          </div>

          <footer className="b3-commission-modal__foot org-delete-modal__foot">
            <div className="org-delete-modal__foot-left">
              <button
                type="button"
                className="b3-commission-modal__cancel"
                disabled={busy}
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
            <button
              type="button"
              className="org-delete-modal__confirm"
              disabled={!canSubmit}
              onClick={onConfirm}
            >
              <DeleteTrashIcon size={16} />
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
          </footer>
        </div>
      </div>
    </>,
    document.body,
  );
}
