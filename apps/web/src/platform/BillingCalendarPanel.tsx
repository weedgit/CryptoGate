import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AuthToast } from "../auth/AuthToast";
import { FieldControl } from "../ui/FieldControl";
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
export function BillingCalendarPanel({ session, onDirtyChange }: Props) {
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

  if (loading) return <PagePending />;

  return (
    <section className="plat-billing-calendar">
      <AuthToast
        message={error ?? message}
        tone={error ? "error" : "ok"}
        onDismiss={() => {
          setError(null);
          setMessage(null);
        }}
      />
      <p className="muted" style={{ marginBottom: "1.25rem", maxWidth: "40rem" }}>
        Platform schedules use <strong>UTC</strong>. Merchant fees use the{" "}
        <strong>activation payment date</strong>: after verify, pay activation;
        one month later (and every month after) the system creates subscription +
        volume invoices at <strong>00:00 UTC</strong>. Auto-send controls whether
        drafts wait for Confirm &amp; send. Agent commission invoices are created
        at <strong>00:00 UTC on remittance From day (C)</strong>; commission =
        paid subscription + volume × rate. Timestamps in lists and history display
        in each user’s profile timezone.
      </p>
      <form className="plat-billing-calendar__form" onSubmit={onSubmit}>
        <details className="plat-billing-calendar__fieldset plat-billing-calendar__legacy">
          <summary className="plat-billing-calendar__legend">
            Merchant pay window (legacy — display only)
          </summary>
          <p className="muted" style={{ margin: "0.5rem 0 0.75rem", fontSize: "0.85rem" }}>
            Not used for due dates. Merchant invoices use{" "}
            <strong>Pay within (days)</strong> from send/create time (activation
            and monthly).
          </p>
          <fieldset disabled style={{ border: 0, margin: 0, padding: 0 }}>
            <div className="plat-billing-calendar__row">
              <FieldControl label="From day" htmlFor="merchant-pay-start">
                <input
                  id="merchant-pay-start"
                  className="b4-field__control"
                  type="number"
                  min={1}
                  max={28}
                  value={form.merchantPayDayStart}
                  readOnly
                  aria-readonly="true"
                />
              </FieldControl>
              <FieldControl label="To day" htmlFor="merchant-pay-end">
                <input
                  id="merchant-pay-end"
                  className="b4-field__control"
                  type="number"
                  min={1}
                  max={28}
                  value={form.merchantPayDayEnd}
                  readOnly
                  aria-readonly="true"
                />
              </FieldControl>
            </div>
          </fieldset>
        </details>

        <fieldset disabled={!canEdit || busy} className="plat-billing-calendar__fieldset">
          <legend className="plat-billing-calendar__legend">
            Agent remittance window (UTC)
          </legend>
          <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "0.85rem" }}>
            From day (C): auto-create agent invoices at 00:00 UTC. To day: remittance /
            catch-up window. Day numbers are UTC calendar days.
          </p>
          <div className="plat-billing-calendar__row">
            <FieldControl label="From day (C)" htmlFor="agent-pay-start">
              <input
                id="agent-pay-start"
                className="b4-field__control"
                type="number"
                min={1}
                max={28}
                value={form.agentPayDayStart}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    agentPayDayStart: Number(e.target.value),
                  }))
                }
              />
            </FieldControl>
            <FieldControl label="To day" htmlFor="agent-pay-end">
              <input
                id="agent-pay-end"
                className="b4-field__control"
                type="number"
                min={1}
                max={28}
                value={form.agentPayDayEnd}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    agentPayDayEnd: Number(e.target.value),
                  }))
                }
              />
            </FieldControl>
          </div>
        </fieldset>

        <fieldset disabled={!canEdit || busy} className="plat-billing-calendar__fieldset">
          <legend className="plat-billing-calendar__legend">Activation invoice</legend>
          <div className="plat-billing-calendar__row">
            <FieldControl label="Activation fee (USD)" htmlFor="activation-fee">
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
            </FieldControl>
            <FieldControl label="Pay within (days)" htmlFor="activation-days">
              <input
                id="activation-days"
                className="b4-field__control"
                type="number"
                min={1}
                max={90}
                value={form.activationPayDays}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    activationPayDays: Number(e.target.value),
                  }))
                }
              />
            </FieldControl>
          </div>
          <p className="muted" style={{ margin: "0.5rem 0 0.75rem", fontSize: "0.85rem" }}>
            Pay within applies to activation and monthly invoices (due = send/create +
            these days).
          </p>
          <label className="plat-billing-calendar__check">
            <input
              type="checkbox"
              checked={form.autoSendInvoices}
              onChange={(e) =>
                setForm((f) => ({ ...f, autoSendInvoices: e.target.checked }))
              }
            />
            Auto-send without confirm (drafts become issued immediately)
          </label>
        </fieldset>

        {canEdit ? (
          <div className="plat-billing-calendar__actions">
            <button
              type="submit"
              className="btn btn--primary"
              disabled={!dirty || busy}
            >
              {busy ? "Saving…" : "Save calendar"}
            </button>
          </div>
        ) : (
          <p className="muted">Only Platform Owner may change these settings.</p>
        )}
      </form>
    </section>
  );
}
