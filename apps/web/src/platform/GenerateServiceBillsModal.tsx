import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  generateServiceBills,
  type GenerateServiceBillsResult,
} from "./api";
import { formatShortDate } from "./org";
import {
  merchantOnboardedInPeriod,
} from "../shared/serviceBillPeriod";

function previousMonthBoundsUtc(now = new Date()): { start: string; end: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1, 1));
  const exclusiveEnd = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(exclusiveEnd.getTime() - 86_400_000);
  return {
    start: start.toISOString().slice(0, 10),
    end: lastDay.toISOString().slice(0, 10),
  };
}

function monthInputValue(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function boundsFromYearMonth(ym: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const [ys, ms] = ym.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || m < 1 || m > 12) return null;
  const start = new Date(Date.UTC(y, m - 1, 1));
  const exclusiveEnd = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(exclusiveEnd.getTime() - 86_400_000);
  return {
    start: start.toISOString().slice(0, 10),
    end: lastDay.toISOString().slice(0, 10),
  };
}

function skipReasonLabel(reason: string): string {
  switch (reason) {
    case "already_issued":
      return "Already issued";
    case "no_commercial":
      return "No commercial settings";
    case "no_fee_tier":
      return "Missing fee tier band";
    case "not_onboarded_in_period":
      return "Not onboarded in period";
    default:
      return reason;
  }
}

export type GenerateBillMerchant = {
  id: string;
  name: string;
  createdAt?: string;
};

type Props = {
  open: boolean;
  orgNames: Map<string, string>;
  merchants: GenerateBillMerchant[];
  onClose: () => void;
  onGenerated: () => void;
};

export function GenerateServiceBillsModal({
  open,
  orgNames,
  merchants,
  onClose,
  onGenerated,
}: Props) {
  const defaults = useMemo(() => previousMonthBoundsUtc(), []);
  const [month, setMonth] = useState(() => monthInputValue(defaults.start));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateServiceBillsResult | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = previousMonthBoundsUtc();
    setMonth(monthInputValue(prev.start));
    setBusy(false);
    setError(null);
    setResult(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const bounds = boundsFromYearMonth(month);

  const preSkipOnboard = useMemo(() => {
    if (!bounds) return [];
    return merchants.filter(
      (m) => !merchantOnboardedInPeriod(m.createdAt, bounds.end),
    );
  }, [bounds, merchants]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!bounds) {
      setError("Choose a valid billing month.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const out = await generateServiceBills({
        periodStart: bounds.start,
        periodEnd: bounds.end,
      });
      setResult(out);
      onGenerated();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to generate service bills",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const skippedByReason = result
    ? result.skipped.reduce<Record<string, number>>((acc, row) => {
        acc[row.reason] = (acc[row.reason] ?? 0) + 1;
        return acc;
      }, {})
    : {};

  return createPortal(
    <>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <div
      className="b3-commission-modal-backdrop plat-issue-bill-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="b3-commission-modal plat-generate-bills-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-bills-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="b3-commission-modal__head">
          <h3 id="generate-bills-title">Generate period bills</h3>
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

        <form className="plat-generate-bills-modal__body" onSubmit={onSubmit}>
          <p className="plat-generate-bills-modal__lede">
            Issues one service bill per active merchant from fee-tier subscription
            plus volume fee on <strong>completed</strong> payment orders. Idempotent —
            merchants that already have a bill for the period are skipped.
          </p>

          <label className="plat-generate-bills-modal__field">
            <span>Billing month (UTC)</span>
            <input
              className="field-control"
              type="month"
              required
              disabled={busy || result != null}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>

          {bounds ? (
            <p className="plat-generate-bills-modal__period">
              Period {formatShortDate(bounds.start)} → {formatShortDate(bounds.end)}
            </p>
          ) : null}

          {bounds && preSkipOnboard.length > 0 ? (
            <div className="plat-generate-bills-modal__warn" role="status">
              <strong>
                {preSkipOnboard.length === merchants.length
                  ? "No merchants were onboarded in this period."
                  : `${preSkipOnboard.length} merchant${preSkipOnboard.length === 1 ? "" : "s"} onboarded after this period will be skipped.`}
              </strong>
              <ul className="plat-generate-bills-modal__warn-list">
                {preSkipOnboard.slice(0, 6).map((m) => (
                  <li key={m.id}>
                    {m.name}
                    {m.createdAt
                      ? ` · onboarded ${formatShortDate(m.createdAt)}`
                      : ""}
                  </li>
                ))}
                {preSkipOnboard.length > 6 ? (
                  <li className="muted">…and {preSkipOnboard.length - 6} more</li>
                ) : null}
              </ul>
              {preSkipOnboard.length === merchants.length ? (
                <p className="muted">
                  Choose the month when merchants were active, or onboard merchants
                  before generating that period.
                </p>
              ) : null}
            </div>
          ) : null}

          {result ? (
            <div className="plat-generate-bills-modal__result">
              <div className="plat-generate-bills-modal__stats">
                <div>
                  <span className="plat-generate-bills-modal__stat-label">Issued</span>
                  <strong>{result.issued.length}</strong>
                </div>
                <div>
                  <span className="plat-generate-bills-modal__stat-label">Skipped</span>
                  <strong>{result.skipped.length}</strong>
                </div>
              </div>
              {Object.keys(skippedByReason).length > 0 ? (
                <ul className="plat-generate-bills-modal__skips">
                  {Object.entries(skippedByReason).map(([reason, count]) => (
                    <li key={reason}>
                      {skipReasonLabel(reason)} — {count}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No merchants skipped.</p>
              )}
              {result.skipped.some((s) => s.reason === "not_onboarded_in_period") ? (
                <ul className="plat-generate-bills-modal__skip-detail">
                  {result.skipped
                    .filter((s) => s.reason === "not_onboarded_in_period")
                    .slice(0, 8)
                    .map((s) => (
                      <li key={s.orgId}>
                        {orgNames.get(s.orgId) ?? s.orgId}
                      </li>
                    ))}
                  {result.skipped.filter((s) => s.reason === "not_onboarded_in_period")
                    .length > 8 ? (
                    <li className="muted">…and more</li>
                  ) : null}
                </ul>
              ) : null}
              {result.skipped.some((s) => s.reason === "no_commercial") ? (
                <ul className="plat-generate-bills-modal__skip-detail">
                  {result.skipped
                    .filter((s) => s.reason === "no_commercial")
                    .slice(0, 8)
                    .map((s) => (
                      <li key={s.orgId}>
                        {orgNames.get(s.orgId) ?? s.orgId}
                      </li>
                    ))}
                  {result.skipped.filter((s) => s.reason === "no_commercial").length >
                  8 ? (
                    <li className="muted">…and more</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="plat-generate-bills-modal__actions">
            {result ? (
              <button type="button" className="btn-primary" onClick={onClose}>
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={busy || !bounds || preSkipOnboard.length === merchants.length}
                >
                  {busy ? "Generating…" : "Generate bills"}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
    </>,
    document.body,
  );
}
