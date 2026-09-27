import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
  /** Total entries across both lists, after each load. */
  onCountChange?: (count: number) => void;
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
      inputClassName="b4-field__control"
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
      className="b4-field__control"
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
        <div>
          <h2 className="plat-waivers__title">
            {title}
            <span className="plat-waivers__count">{rows.length}</span>
          </h2>
          <p className="plat-waivers__hint">{hint}</p>
        </div>
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

/** Service Bills: waive platform fee (N months) and waive activation lists. */
export function BillingWaiversPanel({
  merchants,
  canEdit,
  onBillsChanged,
  onCountChange,
}: Props) {
  const [fee, setFee] = useState<FeeWaiver[]>([]);
  const [activation, setActivation] = useState<ActivationWaiver[]>([]);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await listBillingWaivers();
      setFee(next.fee);
      setActivation(next.activation);
      onCountChange?.(next.fee.length + next.activation.length);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load waivers");
    }
  }, [onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveFee(draft: Draft): Promise<boolean> {
    const months = Number(draft.months);
    if (!draft.orgId) {
      setError("Select a merchant");
      return false;
    }
    if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
      setError(`Months must be a whole number from 1 to ${MAX_MONTHS}`);
      return false;
    }
    setBusy("fee");
    try {
      await putFeeWaiver(draft.orgId, { monthsLeft: months, reason: draft.reason.trim() });
      await load();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save waiver");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveActivation(draft: Draft): Promise<boolean> {
    if (!draft.orgId) {
      setError("Select a merchant");
      return false;
    }
    setBusy("activation");
    try {
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
      await load();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save waiver");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function remove(kind: Kind, orgId: string) {
    setBusy(kind);
    try {
      await deleteBillingWaiver(kind, orgId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove waiver");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="plat-waivers">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <AuthToast message={notice} tone="ok" onDismiss={() => setNotice(null)} />
      <WaiverCard
        kind="fee"
        title="Waive platform fee"
        hint="Each new monthly bill is saved as Waived with the real amounts, and the months left go down by one. The merchant leaves the list at 0."
        rows={fee}
        merchants={merchants}
        canEdit={canEdit}
        busy={busy === "fee"}
        onSave={(draft) => saveFee(draft)}
        onRemove={(orgId) => remove("fee", orgId)}
      />
      <WaiverCard
        kind="activation"
        title="Waive activation"
        hint="When setup is complete the merchant is activated that day and the activation bill is saved as Waived. Then the merchant leaves the list."
        rows={activation}
        merchants={merchants}
        canEdit={canEdit}
        busy={busy === "activation"}
        onSave={(draft) => saveActivation(draft)}
        onRemove={(orgId) => remove("activation", orgId)}
      />
    </div>
  );
}
