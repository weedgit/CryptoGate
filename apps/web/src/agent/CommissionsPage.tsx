import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  invoiceStatusLabel,
  invoiceStatusTone,
} from "../commercial/commissionInvoiceShared";
import { formatCommissionPeriodLabel } from "../commercial/commissionStatements";
import {
  listCommissionPayouts,
  findPayout,
  type CommissionPayoutRecord,
} from "../commercial/commissionPayoutRecords";
import { FundAmount } from "../platform/FundAmount";
import { truncateAddress } from "../platform/orgDetailSeeds";
import { PagePending } from "../platform/ui/PlatformPending";
import { CopyableChainValue } from "../shared/CopyableChainValue";
import { displayServiceBillTxHash } from "../shared/serviceBillPeriod";
import { ApiError, type Session } from "./api";
import { getAgentOrgs, peekAgentOrgs } from "./agentOrgList";
import { sessionCanOnboardMerchant, primaryAgentOrgId } from "./org";
import { agentRoute } from "../shared/portalRouting";

type Props = { session: Session };

type StatusFilter = "current" | "history";

const FETCH_PAGE = 200;
const PERIOD_KEY_RE = /^\d{4}-\d{2}$/;

const STATUS_PILLS: { id: StatusFilter; label: string }[] = [
  { id: "current", label: "Current" },
  { id: "history", label: "History" },
];

function parseStatusFilter(raw: string | null): StatusFilter {
  if (raw === "history" || raw === "settled") return "history";
  return "current";
}

function isOpenInvoice(status: string): boolean {
  return status === "issued" || status === "paid";
}

function listStatusForFilter(filter: StatusFilter): string | string[] {
  return filter === "history" ? "settled" : ["issued", "paid"];
}

function mergePayoutRows(
  prev: CommissionPayoutRecord[],
  next: CommissionPayoutRecord[],
): CommissionPayoutRecord[] {
  const map = new Map(prev.map((r) => [r.id, r]));
  for (const r of next) map.set(r.id, r);
  return [...map.values()];
}

function invoiceMatchesQuery(
  inv: CommissionPayoutRecord,
  queryNorm: string,
): boolean {
  if (!queryNorm) return true;
  const hay = [
    inv.payeeName,
    inv.payeeOrgId,
    inv.periodLabel,
    inv.periodKey,
    inv.payoutStatus,
    inv.payoutAddress,
    inv.txRef,
    displayServiceBillTxHash(inv.txRef),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(queryNorm);
}

function commissionBadgeTone(status: string): string {
  const tone = invoiceStatusTone(status);
  if (tone === "issued") return "warn";
  if (tone === "paid") return "teal";
  if (tone === "settled") return "ok";
  return "muted";
}

function commissionBadgeLabel(status: string): string {
  if (status === "paid") return "Awaiting confirm";
  return invoiceStatusLabel(status);
}

function RowMoreIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
      <circle cx="8" cy="3.5" r="1.35" />
      <circle cx="8" cy="8" r="1.35" />
      <circle cx="8" cy="12.5" r="1.35" />
    </svg>
  );
}

export function CommissionsPage({ session }: Props) {
  const navigate = useNavigate();
  const agentId = primaryAgentOrgId(session);
  const canManage = useMemo(
    () => sessionCanOnboardMerchant(session),
    [session],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(() => peekAgentOrgs() == null);
  const [hasLoaded, setHasLoaded] = useState(() => peekAgentOrgs() != null);
  const hasLoadedRef = useRef(hasLoaded);
  hasLoadedRef.current = hasLoaded;
  const [error, setError] = useState<string | null>(null);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] =
    useState<HTMLElement | null>(null);
  const [platformInvoices, setPlatformInvoices] = useState<
    CommissionPayoutRecord[]
  >([]);
  const [listTotal, setListTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [deepLinkId, setDeepLinkId] = useState<string | null>(null);

  const statusFilter = parseStatusFilter(
    searchParams.get("status") ?? searchParams.get("tab"),
  );

  const deepLinkPayee = searchParams.get("payee");
  const deepLinkPeriod = searchParams.get("period");

  useEffect(() => {
    if (!deepLinkPeriod || !PERIOD_KEY_RE.test(deepLinkPeriod)) {
      setDeepLinkId(null);
      return;
    }
    const payee = deepLinkPayee || agentId;
    if (!payee) {
      setDeepLinkId(null);
      return;
    }
    let cancelled = false;
    void findPayout(payee, deepLinkPeriod)
      .then((p) => {
        if (!cancelled) setDeepLinkId(p?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setDeepLinkId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [deepLinkPayee, deepLinkPeriod, agentId]);

  const setStatus = useCallback(
    (next: StatusFilter) => {
      const params = new URLSearchParams(searchParams);
      if (next === "current") {
        params.delete("status");
        params.delete("tab");
      } else {
        params.set("status", next);
        params.delete("tab");
      }
      params.delete("payee");
      params.delete("period");
      params.delete("from");
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const dismissToast = useCallback(() => setError(null), []);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("agent-topbar-center"));
    setTopbarActionsSlot(document.getElementById("agent-topbar-actions"));
  }, []);

  const loadInvoices = useCallback(async () => {
    if (!agentId) {
      setLoading(false);
      setError("No agent membership on this session");
      return;
    }
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      await getAgentOrgs();
      const page = await listCommissionPayouts({
        payer: "platform",
        payeeOrgId: agentId,
        status: listStatusForFilter(statusFilter),
        limit: FETCH_PAGE,
        offset: 0,
      });
      setPlatformInvoices(page.items);
      setListTotal(page.total);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === "rate_limited"
            ? "Too many requests — wait a moment and retry."
            : err.message
          : err instanceof Error
            ? err.message
            : "Failed to load commission statements",
      );
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [agentId, statusFilter]);

  const loadMoreInvoices = useCallback(async () => {
    if (!agentId || loadingMore || platformInvoices.length >= listTotal) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listCommissionPayouts({
        payer: "platform",
        payeeOrgId: agentId,
        status: listStatusForFilter(statusFilter),
        limit: FETCH_PAGE,
        offset: platformInvoices.length,
      });
      setPlatformInvoices((prev) => mergePayoutRows(prev, page.items));
      setListTotal(page.total);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load more invoices",
      );
    } finally {
      setLoadingMore(false);
    }
  }, [agentId, loadingMore, platformInvoices.length, listTotal, statusFilter]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  const hasMoreServer = platformInvoices.length < listTotal;
  const queryNorm = query.trim().toLowerCase();

  const openPlatformInvoices = useMemo(
    () =>
      platformInvoices
        .filter((p) => isOpenInvoice(p.payoutStatus))
        .filter((p) => invoiceMatchesQuery(p, queryNorm)),
    [platformInvoices, queryNorm],
  );
  const settledPlatformInvoices = useMemo(
    () =>
      platformInvoices
        .filter((p) => p.payoutStatus === "settled")
        .filter((p) => invoiceMatchesQuery(p, queryNorm)),
    [platformInvoices, queryNorm],
  );

  function openInvoice(record: CommissionPayoutRecord) {
    navigate(agentRoute(`commissions/${record.id}`));
  }

  if (deepLinkId) {
    return (
      <Navigate to={agentRoute(`commissions/${deepLinkId}`)} replace />
    );
  }

  return (
    <div className="plat-bills plat-commissions">
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />

      {topbarSlot
        ? createPortal(
            <label className="org-agents__search-wrap plat-bills__search-wrap">
              <span className="org-agents__search-icon" aria-hidden>
                <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                  <circle
                    cx="8.5"
                    cy="8.5"
                    r="5.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M12.75 12.75 16.5 16.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <input
                className="field-control org-agents__search"
                type="search"
                placeholder="Search period, status, or ref…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search commissions"
              />
            </label>,
            topbarSlot,
          )
        : null}

      {topbarActionsSlot
        ? createPortal(
            <button
              type="button"
              className="btn-secondary org-agents__cta"
              onClick={() => window.print()}
            >
              Print / PDF
            </button>,
            topbarActionsSlot,
          )
        : null}

      <div className="plat-bills__toolbar">
        <div
          className="org-agents__pills"
          role="group"
          aria-label="Commission view"
        >
          {STATUS_PILLS.map((pill) => (
            <button
              key={pill.id}
              type="button"
              className={`org-agents__pill${
                statusFilter === pill.id ? " is-active" : ""
              }`}
              aria-pressed={statusFilter === pill.id}
              onClick={() => setStatus(pill.id)}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      <p className="muted plat-commissions__calendar-hint" role="note">
        Platform creates your commission invoice at <strong>00:00 UTC</strong> on
        the agent pay day (default day <strong>10</strong>), for the prior month of
        paid merchant subscription + volume × your rate. Activation fees are
        excluded. Remittance window is typically days 10–15.
      </p>

      <div className="plat-bills__table-wrap">
        {statusFilter === "current" ? (
          <>
            {loading && !hasLoaded ? <PagePending /> : null}
            {!loading && openPlatformInvoices.length === 0 ? (
              <p className="plat-bills__empty">
                {queryNorm
                  ? `No invoices match “${query.trim()}”.`
                  : "No pending or unconfirmed invoices from the platform."}
              </p>
            ) : null}
            {!loading && openPlatformInvoices.length > 0 ? (
              <>
                <table className="plat-bills__table plat-commissions__table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th className="plat-commissions__th-num">Fee collected</th>
                      <th className="plat-commissions__th-num">Rate</th>
                      <th className="plat-commissions__th-num">Commission</th>
                      <th>Status</th>
                      <th>Tx / ref</th>
                      <th className="plat-bills__th-actions">
                        <span className="sr-only">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {openPlatformInvoices.map((inv) => {
                      const href = agentRoute(`commissions/${inv.id}`);
                      return (
                        <tr
                          key={inv.id}
                          className="plat-bills__row plat-commissions__row--review"
                          onClick={(e) => {
                            if (
                              (e.target as HTMLElement).closest(
                                "a, button, .chain-value",
                              )
                            ) {
                              return;
                            }
                            openInvoice(inv);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openInvoice(inv);
                            }
                          }}
                          tabIndex={0}
                          aria-label={`Open ${formatCommissionPeriodLabel(inv.periodKey)} invoice`}
                        >
                          <td className="plat-commissions__period">
                            {formatCommissionPeriodLabel(inv.periodKey)}
                          </td>
                          <td className="plat-commissions__num">
                            <FundAmount amount={inv.platformFeeCollected} />
                          </td>
                          <td className="plat-commissions__rate-cell">
                            {inv.commissionPercent}%
                          </td>
                          <td className="plat-commissions__num plat-commissions__num--emph">
                            <FundAmount amount={inv.commissionAmount} />
                          </td>
                          <td className="plat-bills__status-cell">
                            <span className="plat-bills__status-row">
                              <span
                                className={`plat-bills__badge tone-${commissionBadgeTone(inv.payoutStatus)}`}
                              >
                                {commissionBadgeLabel(inv.payoutStatus)}
                              </span>
                              {canManage && inv.payoutStatus === "paid" ? (
                                <button
                                  type="button"
                                  className="plat-bills__kind-chip is-action"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openInvoice(inv);
                                  }}
                                >
                                  Confirm receipt
                                </button>
                              ) : null}
                            </span>
                          </td>
                          <td
                            className="plat-commissions__tx"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <CopyableChainValue
                              value={
                                displayServiceBillTxHash(inv.txRef) || null
                              }
                              network={inv.network?.trim() || "tron"}
                              kind="tx"
                              display={
                                inv.txRef
                                  ? truncateAddress(
                                      displayServiceBillTxHash(inv.txRef),
                                      8,
                                      6,
                                    )
                                  : undefined
                              }
                            />
                          </td>
                          <td className="plat-bills__td-actions">
                            <Link
                              className="plat-bills__row-more"
                              to={href}
                              aria-label={`Open invoice ${formatCommissionPeriodLabel(inv.periodKey)}`}
                              title="Open invoice"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <RowMoreIcon />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {hasMoreServer ? (
                  <div
                    className="plat-bills__load-more"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      marginTop: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <p className="muted" style={{ margin: 0 }}>
                      Loaded {platformInvoices.length} of {listTotal}
                    </p>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={loadingMore}
                      onClick={() => void loadMoreInvoices()}
                    >
                      {loadingMore ? "Loading…" : "Load more"}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <>
            {loading && !hasLoaded ? <PagePending /> : null}
            {!loading && settledPlatformInvoices.length === 0 ? (
              <p className="plat-bills__empty">
                {queryNorm
                  ? `No invoices match “${query.trim()}”.`
                  : "No confirmed platform invoices yet. Confirm receipt on Current after remittance."}
              </p>
            ) : null}
            {!loading && settledPlatformInvoices.length > 0 ? (
              <>
                <table className="plat-bills__table plat-commissions__table">
                  <thead>
                    <tr>
                      <th>Settled at</th>
                      <th>Period</th>
                      <th className="plat-commissions__th-num">Amount</th>
                      <th>Tx / ref</th>
                      <th>Status</th>
                      <th className="plat-bills__th-actions">
                        <span className="sr-only">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {settledPlatformInvoices.map((inv) => {
                      const href = agentRoute(`commissions/${inv.id}`);
                      return (
                        <tr
                          key={inv.id}
                          className="plat-bills__row plat-commissions__row--review"
                          onClick={(e) => {
                            if (
                              (e.target as HTMLElement).closest(
                                "a, button, .chain-value",
                              )
                            ) {
                              return;
                            }
                            openInvoice(inv);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openInvoice(inv);
                            }
                          }}
                          tabIndex={0}
                          aria-label={`Open ${formatCommissionPeriodLabel(inv.periodKey)} invoice`}
                        >
                          <td className="plat-commissions__paid-at">
                            {inv.settledAt
                              ? new Date(inv.settledAt).toLocaleString()
                              : inv.paidAt
                                ? new Date(inv.paidAt).toLocaleString()
                                : "—"}
                          </td>
                          <td className="plat-commissions__period">
                            {formatCommissionPeriodLabel(inv.periodKey)}
                          </td>
                          <td className="plat-commissions__num plat-commissions__num--emph">
                            <FundAmount amount={inv.commissionAmount} />
                          </td>
                          <td
                            className="plat-commissions__tx"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <CopyableChainValue
                              value={
                                displayServiceBillTxHash(inv.txRef) || null
                              }
                              network={inv.network?.trim() || "tron"}
                              kind="tx"
                              display={
                                inv.txRef
                                  ? truncateAddress(
                                      displayServiceBillTxHash(inv.txRef),
                                      8,
                                      6,
                                    )
                                  : undefined
                              }
                            />
                          </td>
                          <td className="plat-bills__status-cell">
                            <span
                              className={`plat-bills__badge tone-${commissionBadgeTone(inv.payoutStatus)}`}
                            >
                              {commissionBadgeLabel(inv.payoutStatus)}
                            </span>
                          </td>
                          <td className="plat-bills__td-actions">
                            <Link
                              className="plat-bills__row-more"
                              to={href}
                              aria-label={`Open invoice ${formatCommissionPeriodLabel(inv.periodKey)}`}
                              title="Open invoice"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <RowMoreIcon />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {hasMoreServer ? (
                  <div
                    className="plat-bills__load-more"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      marginTop: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <p className="muted" style={{ margin: 0 }}>
                      Loaded {platformInvoices.length} of {listTotal}
                    </p>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={loadingMore}
                      onClick={() => void loadMoreInvoices()}
                    >
                      {loadingMore ? "Loading…" : "Load more"}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
