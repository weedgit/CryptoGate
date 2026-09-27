import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "../auth/AuthToast";
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
      <button type="submit" className="btn-primary plat-waivers__btn" disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        className="btn-secondary plat-waivers__btn"
        disabled={busy}
        onClick={cancelForm}
      >
        Cancel
      </button>
    </span>
  );

  return (
    <section className="plat-waivers__card" aria-label={title}>
      <header className="plat-waivers__head">
        <p className="plat-waivers__hint">{hint}</p>
        {canEdit && !adding ? (
          <button
            type="button"
            className="btn-secondary plat-waivers__btn"
            disabled={busy}
            onClick={startAdd}
          >
            Add merchant
          </button>
        ) : null}
      </header>

      <form onSubmit={submit}>
        <table className="plat-waivers__table">
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
                  <td className="plat-waivers__merchant">{row.orgName ?? row.orgId}</td>
                  {isFee ? <td>{monthsField}</td> : null}
                  <td>{reasonField}</td>
                  <td>{formActions}</td>
                </tr>
              ) : (
                <tr key={row.orgId}>
                  <td className="plat-waivers__merchant">{row.orgName ?? row.orgId}</td>
                  {"monthsLeft" in row ? (
                    <td title={`${row.monthsUsed} of ${row.monthsGranted} used`}>
                      {waivedMonthsLabel(row.monthsLeft)}
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
                              className="btn-secondary plat-waivers__btn is-danger"
                              disabled={busy}
                              onClick={() => void onRemove(row.orgId)}
                            >
                              Confirm remove
                            </button>
                            <button
                              type="button"
                              className="btn-secondary plat-waivers__btn"
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
                              className="btn-secondary plat-waivers__btn"
                              disabled={busy || adding}
                              onClick={() => startEdit(row)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn-secondary plat-waivers__btn"
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
            {rows.length === 0 && !adding ? (
              <tr>
                <td className="plat-waivers__empty" colSpan={isFee ? 4 : 3}>
                  No merchants on this list.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </form>
    </section>
  );
}

const COPY: Record<Kind, { title: string; hint: string }> = {
  fee: {
    title: "Waive platform fee",
    hint: "Each new monthly bill is saved as Waived with the real amounts, and the months left go down by one. The merchant leaves the list at 0.",
  },
  activation: {
    title: "Waive activation",
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
        className="b3-commission-modal-backdrop"
        role="presentation"
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          className="b3-commission-modal plat-waivers-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="b3-commission-modal__head">
            <h3 id={titleId} className="plat-waivers__title">
              {copy.title}
              <span className="plat-waivers__count">{rows.length}</span>
            </h3>
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
      </div>
    </>,
    document.body,
  );
}
