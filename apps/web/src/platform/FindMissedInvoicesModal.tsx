import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import { platformRoute } from "../shared/portalRouting";
import {
  ApiError,
  createMissedInvoice,
  findMissedInvoices,
  type MissedInvoice,
} from "./api";
import { FundAmount } from "./FundAmount";

const PAGE_SIZE = 8;

function utcYmd(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD shown as a UTC calendar day (never shifted by the viewer's zone). */
function utcDay(ymd: string): string {
  return new Date(`${ymd}T00:00:00.000Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function rowKey(m: MissedInvoice): string {
  return `${m.orgId}|${m.periodStart}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** A bill was created — refresh the list behind the popup. */
  onCreated: () => void;
};

/** Service Bills → More → Find missed invoice (Owner / Administrator). */
export function FindMissedInvoicesModal({ open, onClose, onCreated }: Props) {
  const [from, setFrom] = useState(() => utcYmd(-3));
  const [to, setTo] = useState(() => utcYmd(0));
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [missed, setMissed] = useState<MissedInvoice[] | null>(null);
  const [page, setPage] = useState(1);
  const [created, setCreated] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = searching || creating != null;
  const today = utcYmd(0);

  useEffect(() => {
    if (!open) return;
    setFrom(utcYmd(-3));
    setTo(utcYmd(0));
    setMissed(null);
    setPage(1);
    setCreated(null);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  async function runSearch(resetPage: boolean) {
    setSearching(true);
    setError(null);
    try {
      const out = await findMissedInvoices(from, to);
      setMissed(out.missed);
      if (resetPage) setPage(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setCreated(null);
    await runSearch(true);
  }

  async function onCreate(m: MissedInvoice) {
    setCreating(rowKey(m));
    setError(null);
    try {
      const bill = await createMissedInvoice(m.orgId, m.periodStart);
      setCreated({
        id: bill.id,
        label: `${m.orgName} · bill date ${utcDay(m.invoiceOn)}`,
      });
      onCreated();
      await runSearch(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create invoice");
      await runSearch(false);
    } finally {
      setCreating(null);
    }
  }

  if (!open) return null;

  const rows = missed ?? [];
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);
  const creatable = rows.filter((m) => !m.blocker).length;

  return createPortal(
    <>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <div
        className="b3-commission-modal-backdrop"
        role="presentation"
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          className="b3-commission-modal plat-missed-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="find-missed-title"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="b3-commission-modal__head">
            <h3 id="find-missed-title">Find missed invoice</h3>
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

          <div className="plat-missed-modal__body">
            <p className="plat-missed-modal__lede">
              Lists invoices each merchant’s payment-date schedule expected in this
              range that were not created. Bills that already exist — paid, waived,
              draft, issued or overdue — are never listed. Review each one, then
              create it.
            </p>

            <form className="plat-missed-modal__search" onSubmit={onSearch}>
              <label className="plat-missed-modal__field">
                <span>Start date</span>
                <input
                  className="field-control"
                  type="date"
                  required
                  value={from}
                  max={to || today}
                  disabled={busy}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="plat-missed-modal__field">
                <span>End date</span>
                <input
                  className="field-control"
                  type="date"
                  required
                  value={to}
                  min={from || undefined}
                  max={today}
                  disabled={busy}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <button
                type="submit"
                className="btn-primary plat-missed-modal__search-btn"
                disabled={busy || !from || !to}
              >
                {searching && missed == null ? "Searching…" : "Search"}
              </button>
            </form>
            <p className="plat-missed-modal__hint">
              Dates are UTC. Invoices after today are created automatically.
            </p>

            {created ? (
              <p className="plat-missed-modal__created" role="status">
                Created {created.label}.{" "}
                <Link to={platformRoute(`service-bills/${created.id}`)} onClick={onClose}>
                  View bill
                </Link>
              </p>
            ) : null}

            {missed != null ? (
              rows.length === 0 ? (
                <p className="plat-missed-modal__empty">
                  No missed invoices from {utcDay(from)} to {utcDay(to)}.
                </p>
              ) : (
                <div className="plat-missed-modal__results">
                  <p className="plat-missed-modal__summary">
                    {rows.length} missed invoice{rows.length === 1 ? "" : "s"}
                    {creatable < rows.length ? ` · ${creatable} ready to create` : ""}
                  </p>
                  <div className="plat-missed-modal__table-wrap">
                    <table className="plat-missed-modal__table">
                      <thead>
                        <tr>
                          <th>Merchant</th>
                          <th>Bill date</th>
                          <th>Period</th>
                          <th className="is-num">Amount</th>
                          <th aria-label="Action" />
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((m) => (
                          <tr key={rowKey(m)}>
                            <td>
                              <span className="plat-missed-modal__name">{m.orgName}</span>
                              {m.previouslyCancelled ? (
                                <span className="plat-missed-modal__tag is-warn">
                                  Previously cancelled
                                </span>
                              ) : null}
                              {m.willBeWaived ? (
                                <span className="plat-missed-modal__tag">Will be waived</span>
                              ) : null}
                            </td>
                            <td className="plat-missed-modal__date">{utcDay(m.invoiceOn)}</td>
                            <td className="plat-missed-modal__date">
                              {utcDay(m.periodStart)} – {utcDay(m.periodEnd)}
                            </td>
                            <td className="is-num">
                              {m.estimate ? <FundAmount amount={m.estimate.totalAmount} /> : "—"}
                            </td>
                            <td className="plat-missed-modal__action">
                              {m.blocker ? (
                                <span className="plat-missed-modal__blocked">
                                  {m.blocker === "earlier_first" && m.earlierInvoiceOn
                                    ? `Create ${utcDay(m.earlierInvoiceOn)} first`
                                    : m.blockerMessage}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-secondary plat-missed-modal__create"
                                  disabled={busy}
                                  onClick={() => void onCreate(m)}
                                >
                                  {creating === rowKey(m) ? "Creating…" : "Create"}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length > PAGE_SIZE ? (
                      <nav className="plat-missed-modal__pager" aria-label="Missed invoice pages">
                        <span>
                          {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of {rows.length}
                        </span>
                        <span className="plat-missed-modal__pager-controls">
                          <button
                            type="button"
                            aria-label="Previous page"
                            disabled={current <= 1}
                            onClick={() => setPage(current - 1)}
                          >
                            ‹
                          </button>
                          <span>
                            {current} / {pageCount}
                          </span>
                          <button
                            type="button"
                            aria-label="Next page"
                            disabled={current >= pageCount}
                            onClick={() => setPage(current + 1)}
                          >
                            ›
                          </button>
                        </span>
                      </nav>
                    ) : null}
                  </div>
                </div>
              )
            ) : null}
          </div>

          <footer className="plat-missed-modal__foot">
            <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>
              Close
            </button>
          </footer>
        </div>
      </div>
    </>,
    document.body,
  );
}
