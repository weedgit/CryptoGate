import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import { OnboardWizardBrandHead } from "../shared/onboardMerchantUi";
import { platformRoute } from "../shared/portalRouting";
import { formatSlashDate } from "../shared/serviceBillPeriod";
import {
  ApiError,
  createMissedInvoice,
  findMissedInvoices,
  type MissedInvoice,
} from "./api";
import { FundAmount } from "./FundAmount";

const PAGE_SIZE = 7;

function utcYmd(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function rowKey(m: MissedInvoice): string {
  return `${m.orgId}|${m.periodStart}`;
}

type Tone = "ok" | "warn" | "anomaly" | "muted";

function rowState(m: MissedInvoice): { label: string; tone: Tone; note: string | null } {
  if (m.blocker === "earlier_first") {
    return {
      label: "Waiting",
      tone: "muted",
      note: m.earlierInvoiceOn
        ? `Create ${formatSlashDate(m.earlierInvoiceOn)} first`
        : m.blockerMessage,
    };
  }
  if (m.blocker === "paused") {
    return { label: "Suspended", tone: "anomaly", note: m.blockerMessage };
  }
  if (m.blocker) {
    return { label: "Blocked", tone: "anomaly", note: m.blockerMessage };
  }
  if (m.previouslyCancelled) {
    return { label: "Re-bill", tone: "warn", note: "Previously cancelled" };
  }
  return { label: "Ready", tone: "ok", note: null };
}

function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const STAT_ICONS: Record<"missed" | "ready" | "rebill" | "blocked", ReactNode> = {
  missed: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.9" />
      <path d="M12 7.5v5.5" stroke="#0b1018" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="16.3" r="1.25" fill="#0b1018" />
    </svg>
  ),
  ready: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.9" />
      <path
        d="M8 12.2l2.7 2.7L16 9.6"
        stroke="#0b1018"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  rebill: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  blocked: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
      <path d="M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** A bill was created — refresh the list behind the popup. */
  onCreated: () => void;
  /** Merchant logos from the bills page, keyed by org ID. */
  merchantIcons?: Map<string, string | null>;
};

/** Service Bills → More → Find missed invoice (Owner / Administrator). */
export function FindMissedInvoicesModal({ open, onClose, onCreated, merchantIcons }: Props) {
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
        label: `${m.orgName} · bill date ${formatSlashDate(m.invoiceOn)}`,
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
  const ready = rows.filter((m) => !m.blocker).length;
  const rebill = rows.filter((m) => !m.blocker && m.previouslyCancelled).length;
  const blocked = rows.length - ready;
  const stats: { id: keyof typeof STAT_ICONS; label: string; value: number }[] = [
    { id: "missed", label: "missed", value: rows.length },
    { id: "ready", label: "ready", value: ready },
    { id: "rebill", label: "re-bill", value: rebill },
    { id: "blocked", label: "blocked", value: blocked },
  ];

  const emptyMessage =
    missed == null
      ? "Pick a date range and search."
      : `No missed invoices from ${formatSlashDate(from)} to ${formatSlashDate(to)}.`;

  return createPortal(
    <>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <div
        className="b4-wizard-portal plat-missed-portal"
        role="presentation"
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          className="plat-missed-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="find-missed-title"
          onClick={(e) => e.stopPropagation()}
        >
          <OnboardWizardBrandHead
            titleId="find-missed-title"
            title="Find missed invoice"
            subtitle="Find bills that were never created, then create them one by one."
            onClose={onClose}
            closeDisabled={busy}
            icon={<SearchIcon size={24} />}
          />

          <div className="plat-missed-modal__body">
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
              <span className="plat-missed-modal__range-sep" aria-hidden>
                →
              </span>
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
                className="b4-wizard__continue b4-wizard__continue--gold plat-missed-modal__search-btn"
                disabled={busy || !from || !to}
              >
                <SearchIcon />
                {searching && missed == null ? "Searching…" : "Search"}
              </button>
              <p className="plat-missed-modal__hint">
                UTC days · up to today. Later bills are created automatically.
              </p>
            </form>

            <div className="plat-missed-modal__stats" role="status">
              {stats.map((s) => (
                <div key={s.id} className={`plat-missed-modal__stat is-${s.id}`}>
                  <span className="plat-missed-modal__stat-icon">{STAT_ICONS[s.id]}</span>
                  <strong>{missed == null ? "—" : s.value}</strong>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>

            {created ? (
              <p className="plat-missed-modal__created" role="status">
                <span>Created {created.label}.</span>
                <Link to={platformRoute(`service-bills/${created.id}`)} onClick={onClose}>
                  View bill →
                </Link>
              </p>
            ) : null}

            <div className="plat-missed-modal__table-wrap">
              <div className="plat-missed-modal__table-scroll">
                <table className="plat-missed-modal__table">
                  <thead>
                    <tr>
                      <th>Merchant</th>
                      <th>Amount</th>
                      <th>Billing period</th>
                      <th>Bill date</th>
                      <th>Status</th>
                      <th className="plat-missed-modal__th-action">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((m, index) => {
                      const state = rowState(m);
                      return (
                        <tr
                          key={rowKey(m)}
                          className={m.blocker ? "is-blocked" : undefined}
                          style={{ animationDelay: `${index * 35}ms` }}
                        >
                          <td className="plat-missed-modal__merchant">
                            <span className="plat-missed-modal__merchant-cell">
                              <OrgBrandMark
                                name={m.orgName}
                                iconKey={merchantIcons?.get(m.orgId) ?? null}
                                size={32}
                                className="plat-missed-modal__avatar"
                              />
                              <span className="plat-missed-modal__merchant-meta">
                                <Link
                                  className="plat-missed-modal__merchant-name"
                                  to={platformRoute(`merchants/${m.orgId}`)}
                                  onClick={onClose}
                                >
                                  {m.orgName}
                                </Link>
                                {m.willBeWaived ? (
                                  <span className="plat-missed-modal__waived">
                                    Will be waived
                                  </span>
                                ) : null}
                              </span>
                            </span>
                          </td>
                          <td className="plat-missed-modal__amount-cell">
                            {m.estimate ? (
                              <>
                                <span className="plat-missed-modal__total">
                                  <FundAmount amount={m.estimate.totalAmount} />
                                </span>
                                <span className="plat-missed-modal__fee-parts">
                                  <FundAmount amount={m.estimate.subscriptionAmount} />
                                  {" + "}
                                  <FundAmount amount={m.estimate.volumeFeeAmount} />
                                </span>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="plat-missed-modal__period">
                            <span>{formatSlashDate(m.periodStart)} –</span>
                            <span>{formatSlashDate(m.periodEnd)}</span>
                          </td>
                          <td className="plat-missed-modal__date">
                            {formatSlashDate(m.invoiceOn)}
                          </td>
                          <td className="plat-missed-modal__status">
                            <span className={`plat-missed-modal__badge tone-${state.tone}`}>
                              {state.label}
                            </span>
                            {state.note ? (
                              <span className="plat-missed-modal__note">{state.note}</span>
                            ) : null}
                          </td>
                          <td className="plat-missed-modal__action">
                            {m.blocker ? (
                              <span className="plat-missed-modal__no-action" aria-label="Not available">
                                —
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
                      );
                    })}
                  </tbody>
                </table>
                {rows.length === 0 ? (
                  <p
                    className={`plat-missed-modal__empty${missed != null ? " is-clear" : ""}`}
                  >
                    {searching ? "Searching…" : emptyMessage}
                  </p>
                ) : null}
              </div>
              <nav className="org-pager" aria-label="Missed invoice pages">
                <p className="org-pager__meta">
                  {rows.length === 0
                    ? "0 of 0"
                    : `${start + 1}–${Math.min(start + PAGE_SIZE, rows.length)} of ${rows.length}`}
                </p>
                <div className="org-pager__controls">
                  <button
                    type="button"
                    className="org-pager__btn"
                    disabled={current <= 1}
                    onClick={() => setPage(current - 1)}
                  >
                    Prev
                  </button>
                  <span className="org-pager__page">
                    {current} / {pageCount}
                  </span>
                  <button
                    type="button"
                    className="org-pager__btn"
                    disabled={current >= pageCount}
                    onClick={() => setPage(current + 1)}
                  >
                    Next
                  </button>
                </div>
              </nav>
            </div>
          </div>

          <footer className="b4-wizard__foot plat-missed-modal__foot">
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
