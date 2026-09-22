import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  patchOrgOwnerProfile,
  putOrgOwnerVerification,
  type OrgPrimaryOwnerContact,
} from "../platform/api";

type Props = {
  orgId: string;
  owner: OrgPrimaryOwnerContact | null;
  loading?: boolean;
  /** Platform Owner only — show support edit / verification override. */
  canSupportEdit: boolean;
  onOwnerUpdated: (next: OrgPrimaryOwnerContact) => void;
  /**
   * When true, wrap fields in an Owner section with header + Edit.
   * When false, render fields only (parent supplies section chrome).
   */
  asSection?: boolean;
};

function ownerDisplayName(owner: OrgPrimaryOwnerContact | null): string {
  if (!owner) return "—";
  const first = (owner.firstName ?? "").trim();
  const last = (owner.lastName ?? "").trim();
  if (first || last) return [first, last].filter(Boolean).join(" ");
  return "—";
}

function VerificationBadge({ verified, label }: { verified: boolean; label: string }) {
  return (
    <span
      className={`b3-profile__verify${verified ? " is-verified" : " is-pending"}`}
      title={verified ? `${label} verified` : `${label} not verified`}
    >
      {verified ? "Verified" : "Not verified"}
    </span>
  );
}

function dash(value: string | null | undefined, loading: boolean): string {
  if (loading) return "…";
  const t = value?.trim();
  return t ? t : "—";
}

/**
 * Owner contact fields + Platform Owner support edit / verification override.
 */
export function OrgOwnerSupportFields({
  orgId,
  owner,
  loading = false,
  canSupportEdit,
  onOwnerUpdated,
  asSection = false,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleVerified(field: "emailVerified" | "phoneVerified") {
    if (!owner || !canSupportEdit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await putOrgOwnerVerification(orgId, {
        [field]: !owner[field],
      });
      onOwnerUpdated({ ...owner, ...next });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not update verification",
      );
    } finally {
      setBusy(false);
    }
  }

  const fields = (
    <>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <div className="b3-profile__field">
        <p className="b3-profile__label">First name</p>
        <p className="b3-profile__value">
          {dash(owner?.firstName, loading)}
        </p>
      </div>
      <div className="b3-profile__field">
        <p className="b3-profile__label">Last name</p>
        <p className="b3-profile__value">
          {dash(owner?.lastName, loading)}
        </p>
      </div>
      {!asSection ? (
        <div className="b3-profile__field">
          <p className="b3-profile__label">Full name</p>
          <div className="b3-profile__value-row">
            <p className="b3-profile__value">
              {loading ? "…" : ownerDisplayName(owner)}
            </p>
            {canSupportEdit && owner ? (
              <button
                type="button"
                className="b3-profile__edit-btn"
                disabled={busy}
                onClick={() => setEditOpen(true)}
              >
                Edit
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="b3-profile__field">
        <p className="b3-profile__label">Email</p>
        <div className="b3-profile__value-row">
          <p className="b3-profile__value">{dash(owner?.email, loading)}</p>
          {owner ? (
            <>
              <VerificationBadge verified={owner.emailVerified} label="Email" />
              {canSupportEdit ? (
                <button
                  type="button"
                  className="b3-profile__edit-btn"
                  disabled={busy}
                  onClick={() => void toggleVerified("emailVerified")}
                >
                  {owner.emailVerified ? "Mark unverified" : "Mark verified"}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      <div className="b3-profile__field">
        <p className="b3-profile__label">Phone</p>
        <div className="b3-profile__value-row">
          <p className="b3-profile__value">{dash(owner?.phone, loading)}</p>
          {owner?.phone ? (
            <VerificationBadge verified={owner.phoneVerified} label="Phone" />
          ) : null}
          {canSupportEdit && owner ? (
            <button
              type="button"
              className="b3-profile__edit-btn"
              disabled={busy}
              onClick={() => void toggleVerified("phoneVerified")}
            >
              {owner.phoneVerified ? "Mark unverified" : "Mark verified"}
            </button>
          ) : null}
        </div>
      </div>
      <div className="b3-profile__field">
        <p className="b3-profile__label">Timezone</p>
        <p className="b3-profile__value">{dash(owner?.timezone, loading)}</p>
      </div>
      {editOpen && owner ? (
        <OwnerProfileEditModal
          orgId={orgId}
          owner={owner}
          onClose={() => setEditOpen(false)}
          onSaved={(next) => {
            onOwnerUpdated({ ...owner, ...next });
            setEditOpen(false);
          }}
        />
      ) : null}
    </>
  );

  if (!asSection) return fields;

  return (
    <section className="b3-card b3-card--section b3-card--flat" aria-label="Owner">
      <div className="b3-profile__head">
        <h3 className="b3-card__heading">Owner</h3>
        {canSupportEdit && owner ? (
          <button
            type="button"
            className="b3-profile__edit-btn"
            disabled={busy}
            onClick={() => setEditOpen(true)}
          >
            Edit
          </button>
        ) : null}
      </div>
      <div className="b3-profile">{fields}</div>
    </section>
  );
}

function OwnerProfileEditModal({
  orgId,
  owner,
  onClose,
  onSaved,
}: {
  orgId: string;
  owner: OrgPrimaryOwnerContact;
  onClose: () => void;
  onSaved: (next: OrgPrimaryOwnerContact) => void;
}) {
  const [firstName, setFirstName] = useState(owner.firstName ?? "");
  const [lastName, setLastName] = useState(owner.lastName ?? "");
  const [timezone, setTimezone] = useState(owner.timezone || "UTC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(owner.firstName ?? "");
    setLastName(owner.lastName ?? "");
    setTimezone(owner.timezone || "UTC");
  }, [owner]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await patchOrgOwnerProfile(orgId, {
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        timezone: timezone.trim() || "UTC",
      });
      onSaved(next);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not update owner profile",
      );
    } finally {
      setBusy(false);
    }
  }

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
        aria-label="Edit owner profile"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="b3-commission-modal__head">
          <h3>Edit owner profile</h3>
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
        <form className="b3-commission-modal__body" onSubmit={onSubmit}>
          <AuthToast
            message={error}
            tone="error"
            onDismiss={() => setError(null)}
          />
          <label className="field">
            <span className="field-label">First name</span>
            <input
              className="field-control"
              value={firstName}
              maxLength={80}
              disabled={busy}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              autoFocus
            />
          </label>
          <label className="field">
            <span className="field-label">Last name</span>
            <input
              className="field-control"
              value={lastName}
              maxLength={80}
              disabled={busy}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </label>
          <label className="field">
            <span className="field-label">Timezone</span>
            <input
              className="field-control"
              value={timezone}
              maxLength={64}
              disabled={busy}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </label>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Email is the sign-in identity and cannot be changed here. Use
            verification controls on the overview to mark email/phone verified.
          </p>
          <footer className="b3-commission-modal__foot">
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
