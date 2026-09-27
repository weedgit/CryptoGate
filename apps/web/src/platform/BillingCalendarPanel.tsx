import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AuthToast } from "../auth/AuthToast";
import { NumberStepper } from "../ui/NumberStepper";
import {
  ApiError,
  getBillingCalendarSettings,
  updateBillingCalendarSettings,
  type BillingCalendarSettings,
  type Session,
} from "./api";
import { sessionIsPlatformOwner } from "./org";
import { PagePending } from "./ui/PlatformPending";

type Props = {
  session: Session;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  /** Nested under Fees single-page layout — quieter chrome. */
  embedded?: boolean;
  /** Form id for external submit (title-row Save). */
  formId?: string;
};

const EMPTY: BillingCalendarSettings = {
  merchantPayDayStart: 5,
  merchantPayDayEnd: 10,
  agentPayDayStart: 10,
  agentPayDayEnd: 15,
  activationFeeUsd: "49.00",
  activationPayDays: 7,
  autoSendInvoices: false,
  updatedAt: "",
};

/** Owner-configurable activation fee, auto-send, and agent remittance window. */
export function BillingCalendarPanel({
  session,
  onDirtyChange,
  onBusyChange,
  embedded = false,
  formId = "fee-billing-calendar-form",
}: Props) {
  const canEdit = useMemo(() => sessionIsPlatformOwner(session), [session]);
  const [form, setForm] = useState<BillingCalendarSettings>(EMPTY);
  const [saved, setSaved] = useState<BillingCalendarSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const dirty =
    form.agentPayDayStart !== saved.agentPayDayStart ||
    form.agentPayDayEnd !== saved.agentPayDayEnd ||
    form.activationFeeUsd !== saved.activationFeeUsd ||
    form.activationPayDays !== saved.activationPayDays ||
    form.autoSendInvoices !== saved.autoSendInvoices;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = await getBillingCalendarSettings();
      setForm(settings);
      setSaved(settings);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load billing calendar settings",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const settings = await updateBillingCalendarSettings({
        merchantPayDayStart: Number(form.merchantPayDayStart),
        merchantPayDayEnd: Number(form.merchantPayDayEnd),
        agentPayDayStart: Number(form.agentPayDayStart),
        agentPayDayEnd: Number(form.agentPayDayEnd),
        activationFeeUsd: form.activationFeeUsd.trim(),
        activationPayDays: Number(form.activationPayDays),
        autoSendInvoices: form.autoSendInvoices,
      });
      setForm(settings);
      setSaved(settings);
      setMessage("Billing calendar saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <PagePending title={embedded ? "Loading billing calendar…" : undefined} />
    );
  }

  return (
    <section
      className={`plat-billing-calendar${embedded ? " plat-billing-calendar--embedded" : ""}`}
    >
      <AuthToast
        message={error ?? message}
        tone={error ? "error" : "ok"}
        onDismiss={() => {
          setError(null);
          setMessage(null);
        }}
      />
      <form
        id={formId}
        className="plat-billing-calendar__form"
        onSubmit={onSubmit}
      >
        <div className="plat-billing-calendar__cards">
        <fieldset disabled={!canEdit || busy} className="plat-billing-calendar__fieldset">
          <legend className="plat-billing-calendar__legend">
            Agent remittance window (UTC)
          </legend>
          <div className="plat-billing-calendar__row">
            <div className="b4-field">
              <label className="b4-field__label" htmlFor="agent-pay-start">
                From day (C)
              </label>
              <NumberStepper
                id="agent-pay-start"
                className="plat-billing-calendar__stepper"
                inputClassName="b4-field__control"
                min={1}
                max={28}
                value={form.agentPayDayStart}
                aria-label="Agent pay from day"
                onChange={(raw) => {
                  const n = Number(raw);
                  if (!Number.isFinite(n)) return;
                  setForm((f) => ({ ...f, agentPayDayStart: n }));
                }}
              />
            </div>
            <div className="b4-field">
              <label className="b4-field__label" htmlFor="agent-pay-end">
                To day
              </label>
              <NumberStepper
                id="agent-pay-end"
                className="plat-billing-calendar__stepper"
                inputClassName="b4-field__control"
                min={1}
                max={28}
                value={form.agentPayDayEnd}
                aria-label="Agent pay to day"
                onChange={(raw) => {
                  const n = Number(raw);
                  if (!Number.isFinite(n)) return;
                  setForm((f) => ({ ...f, agentPayDayEnd: n }));
                }}
              />
            </div>
          </div>
        </fieldset>

        <fieldset disabled={!canEdit || busy} className="plat-billing-calendar__fieldset">
          <legend className="plat-billing-calendar__legend">Activation invoice</legend>
          <div className="plat-billing-calendar__row plat-billing-calendar__row--activation">
            <div className="b4-field">
              <label className="b4-field__label" htmlFor="activation-fee">
                Activation fee (USD)
              </label>
              <input
                id="activation-fee"
                className="b4-field__control"
                type="text"
                inputMode="decimal"
                value={form.activationFeeUsd}
                onChange={(e) =>
                  setForm((f) => ({ ...f, activationFeeUsd: e.target.value }))
                }
              />
            </div>
            <div className="b4-field">
              <label className="b4-field__label" htmlFor="activation-days">
                Pay within (days)
              </label>
              <NumberStepper
                id="activation-days"
                className="plat-billing-calendar__stepper"
                inputClassName="b4-field__control"
                min={1}
                max={90}
                value={form.activationPayDays}
                aria-label="Pay within days"
                onChange={(raw) => {
                  const n = Number(raw);
                  if (!Number.isFinite(n)) return;
                  setForm((f) => ({ ...f, activationPayDays: n }));
                }}
              />
            </div>
            <label className="plat-billing-calendar__check">
              <input
                type="checkbox"
                checked={form.autoSendInvoices}
                onChange={(e) =>
                  setForm((f) => ({ ...f, autoSendInvoices: e.target.checked }))
                }
              />
              Auto-send invoices
            </label>
          </div>
        </fieldset>
        </div>

        {canEdit ? (
          <div className="plat-billing-calendar__actions">
            <button
              type="submit"
              className={embedded ? "plat-fees__save" : "btn btn--primary"}
              disabled={!dirty || busy}
            >
              {busy ? "Saving…" : "Save calendar"}
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
