import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "../auth/AuthToast";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import { OnboardWizardBrandHead } from "../shared/onboardMerchantUi";
import { NumberStepper } from "../ui/NumberStepper";
import { SearchableSelect } from "../ui/SearchableSelect";
import { waivedMonthsLabel } from "../commercialLabels";
import { invalidateServiceBillsServer } from "../shared/serviceBillsServer";
import {
  ApiError,
  deleteBillingWaiver,
  listBillingWaivers,
  putActivationWaiver,
  putFeeWaiver,
  type ActivationWaiver,
  type FeeWaiver,
} from "./api";

type Kind = "fee" | "activation";

type Props = {
  merchants: { id: string; name: string }[];
  /** Owner / Administrator: add, edit, remove. Viewer: read only. */
  canEdit: boolean;
  /** Called after a change that may have created or waived bills. */
  onBillsChanged?: () => void;
};

type Draft = { orgId: string; months: string; reason: string };

const EMPTY_DRAFT: Draft = { orgId: "", months: "1", reason: "" };
const MAX_MONTHS = 120;

function WaiverCard({
  kind,
  title,
  hint,
  rows,
  merchants,
  canEdit,
  busy,
  onSave,
  onRemove,
}: {
  kind: Kind;
  title: string;
  hint: string;
  rows: (FeeWaiver | ActivationWaiver)[];
  merchants: { id: string; name: string }[];
  canEdit: boolean;
  busy: boolean;
  onSave: (draft: Draft, isNew: boolean) => Promise<boolean>;
  onRemove: (orgId: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const isFee = kind === "fee";

  const merchantOptions = useMemo(() => {
    const listed = new Set(rows.map((r) => r.orgId));
    return merchants
      .filter((m) => !listed.has(m.id))
      .map((m) => ({ id: m.id, label: m.name }));
  }, [merchants, rows]);

  function startAdd() {
    setEditingId(null);
    setConfirmRemoveId(null);
    setDraft(EMPTY_DRAFT);
    setAdding(true);
  }

  function startEdit(row: FeeWaiver | ActivationWaiver) {
    setAdding(false);
    setConfirmRemoveId(null);
    setDraft({
      orgId: row.orgId,
      months: "monthsLeft" in row ? String(row.monthsLeft) : "1",
      reason: row.reason,
    });
    setEditingId(row.orgId);
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await onSave(draft, adding);
    if (ok) cancelForm();
  }

  const monthsField = (
    <NumberStepper
      className="plat-waivers__stepper"
      inputClassName="field-control"
      min={1}
      max={MAX_MONTHS}
      value={draft.months}
      disabled={busy}
      aria-label="Waived months"
      onChange={(raw) => setDraft((d) => ({ ...d, months: raw }))}
    />
  );

  const reasonField = (
    <input
      className="field-control"
      required
      maxLength={500}
      value={draft.reason}
      disabled={busy}
      placeholder="Reason (required)"
      aria-label="Reason"
      onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
    />
  );

  const formActions = (
    <span className="plat-waivers__row-actions">
      <button type="submit" className="plat-waivers__btn is-gold" disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        className="plat-waivers__btn"
        disabled={busy}
        onClick={cancelForm}
      >
        Cancel
      </button>
    </span>
  );

  return (
    <section className="plat-waivers__card" aria-label={title}>
      <div className="plat-waivers__toolbar">
        <div className="plat-missed-modal__stat is-ready plat-waivers__stat">
          <strong>{rows.length}</strong>
          <span>merchant{rows.length === 1 ? "" : "s"} on this list</span>
        </div>
        <p className="plat-waivers__hint">{hint}</p>
        {canEdit ? (
          <button
            type="button"
            className="b4-wizard__continue b4-wizard__continue--gold plat-waivers__add"
            disabled={busy || adding}
            onClick={startAdd}
          >
            + Add merchant
          </button>
        ) : null}
      </div>

      <form className="plat-missed-modal__table-wrap" onSubmit={submit}>
        <div className="plat-missed-modal__table-scroll">
        <table className="plat-missed-modal__table plat-waivers__table">
          <thead>
            <tr>
              <th>Merchant</th>
              {isFee ? <th>Months left</th> : null}
              <th>Reason</th>
              {canEdit ? <th className="plat-waivers__th-actions" aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {adding ? (
              <tr className="is-editing">
                <td>
                  <SearchableSelect
                    value={draft.orgId}
                    options={merchantOptions}
                    placeholder="Select merchant"
                    ariaLabel="Merchant"
                    disabled={busy}
                    onChange={(id) => setDraft((d) => ({ ...d, orgId: id }))}
                  />
                </td>
                {isFee ? <td>{monthsField}</td> : null}
                <td>{reasonField}</td>
                <td>{formActions}</td>
              </tr>
            ) : null}
            {rows.map((row) =>
              editingId === row.orgId ? (
                <tr key={row.orgId} className="is-editing">
                  <td className="plat-waivers__merchant">
                    <MerchantCell name={row.orgName ?? row.orgId} />
                  </td>
                  {isFee ? <td>{monthsField}</td> : null}
                  <td>{reasonField}</td>
                  <td>{formActions}</td>
                </tr>
              ) : (
                <tr key={row.orgId}>
                  <td className="plat-waivers__merchant">
                    <MerchantCell name={row.orgName ?? row.orgId} />
                  </td>
                  {"monthsLeft" in row ? (
                    <td>
                      <span className="plat-missed-modal__badge tone-ok">
                        {waivedMonthsLabel(row.monthsLeft)}
                      </span>
                      <span className="plat-missed-modal__note">
                        {row.monthsUsed} of {row.monthsGranted} used
                      </span>
                    </td>
                  ) : null}
                  <td className="plat-waivers__reason">{row.reason}</td>
                  {canEdit ? (
                    <td>
                      <span className="plat-waivers__row-actions">
                        {confirmRemoveId === row.orgId ? (
                          <>
                            <button
                              type="button"
                              className="plat-waivers__btn is-danger"
                              disabled={busy}
                              onClick={() => void onRemove(row.orgId)}
                            >
                              Confirm remove
                            </button>
                            <button
                              type="button"
                              className="plat-waivers__btn"
                              disabled={busy}
                              onClick={() => setConfirmRemoveId(null)}
                            >
                              Keep
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="plat-waivers__btn"
                              disabled={busy || adding}
                              onClick={() => startEdit(row)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="plat-waivers__btn"
                              disabled={busy}
                              onClick={() => setConfirmRemoveId(row.orgId)}
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </span>
                    </td>
                  ) : null}
                </tr>
              ),
            )}
          </tbody>
        </table>
        {rows.length === 0 && !adding ? (
          <p className="plat-missed-modal__empty">No merchants on this list.</p>
        ) : null}
        </div>
      </form>
    </section>
  );
}

function MerchantCell({ name }: { name: string }) {
  return (
    <span className="plat-missed-modal__merchant-cell">
      <OrgBrandMark name={name} size={32} className="plat-missed-modal__avatar" />
      <span className="plat-waivers__merchant-name">{name}</span>
    </span>
  );
}

function PercentIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M19 5 5 19M7.5 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm9 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const COPY: Record<Kind, { title: string; subtitle: string; hint: string }> = {
  fee: {
    title: "Waive platform fee",
    subtitle: "Skip monthly platform fees for chosen merchants.",
    hint: "Each new monthly bill is saved as Waived with the real amounts, and the months left go down by one. The merchant leaves the list at 0.",
  },
  activation: {
    title: "Waive activation",
    subtitle: "Activate chosen merchants without an activation fee.",
    hint: "When setup is complete the merchant is activated that day and the activation bill is saved as Waived. Then the merchant leaves the list.",
  },
};

/** Service Bills → More → Waive platform fee / Waive activation popup. */
export function BillingWaiverModal({
  kind,
  onClose,
  merchants,
  canEdit,
  onBillsChanged,
}: Props & { kind: Kind; onClose: () => void }) {
  const [rows, setRows] = useState<(FeeWaiver | ActivationWaiver)[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const copy = COPY[kind];

  const load = useCallback(async () => {
    try {
      const next = await listBillingWaivers();
      setRows(kind === "fee" ? next.fee : next.activation);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load waivers");
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function save(draft: Draft): Promise<boolean> {
    if (!draft.orgId) {
      setError("Select a merchant");
      return false;
    }
    const months = Number(draft.months);
    if (
      kind === "fee" &&
      (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS)
    ) {
      setError(`Months must be a whole number from 1 to ${MAX_MONTHS}`);
      return false;
    }
    setBusy(true);
    try {
      if (kind === "fee") {
        await putFeeWaiver(draft.orgId, { monthsLeft: months, reason: draft.reason.trim() });
      } else {
        const saved = await putActivationWaiver(draft.orgId, {
          reason: draft.reason.trim(),
        });
        if (saved.activated) {
          setNotice(
            `${saved.orgName ?? "Merchant"} had finished setup, so it was activated today with a waived activation bill.`,
          );
          invalidateServiceBillsServer();
          onBillsChanged?.();
        }
      }
      await load();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save waiver");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(orgId: string) {
    setBusy(true);
    try {
      await deleteBillingWaiver(kind, orgId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove waiver");
    } finally {
      setBusy(false);
    }
  }

  const titleId = `billing-waiver-${kind}-title`;

  return createPortal(
    <>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <AuthToast message={notice} tone="ok" onDismiss={() => setNotice(null)} />
      <div
        className="b4-wizard-portal"
        role="presentation"
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          className="plat-waivers-pop"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
        >
          <OnboardWizardBrandHead
            titleId={titleId}
            title={copy.title}
            subtitle={copy.subtitle}
            onClose={onClose}
            closeDisabled={busy}
            icon={kind === "fee" ? <PercentIcon /> : <StarIcon />}
          />
          <div className="plat-waivers-pop__body">
            <WaiverCard
              kind={kind}
              title={copy.title}
              hint={copy.hint}
              rows={rows}
              merchants={merchants}
              canEdit={canEdit}
              busy={busy}
              onSave={(draft) => save(draft)}
              onRemove={remove}
            />
          </div>
          <footer className="b4-wizard__foot">
            <span />
            <button type="button" className="b4-wizard__cancel" disabled={busy} onClick={onClose}>
              Close
            </button>
          </footer>
        </div>
      </div>
    </>,
    document.body,
  );
}
