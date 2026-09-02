import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { merchantRoute } from "../shared/portalRouting";
import { AuthToast } from "../auth/AuthToast";
import { FundAmount } from "../platform/FundAmount";
import { PagePending } from "../platform/ui/PlatformPending";
import {
  ApiError,
  getMerchantCommercial,
  getOrg,
  type MerchantCommercialSettings,
  type ServiceBill,
  type Session,
} from "./api";
import {
  getMerchantServiceBills,
  peekMerchantServiceBills,
} from "./merchantServiceBillsList";
import { getCachedServiceBill } from "../shared/serviceBillDetailCache";
import { formatShortDate } from "../platform/org";
import { tierLabel } from "../commercialLabels";
import {
  formatBillId,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";
import {
  primaryMerchantOrgId,
  sessionCanCheckoutServiceBill,
} from "./org";

type Filter = "all" | "overdue" | "unpaid" | "paid";

const STATUS_PILLS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unpaid", label: "Unpaid" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
];

type Props = { session: Session };

function matchesFilter(bill: ServiceBill, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "unpaid":
      return bill.status === "issued" || bill.status === "overdue";
    case "overdue":
      return bill.status === "overdue";
    case "paid":
      return bill.status === "paid";
    default:
      return true;
  }
}

function matchesQuery(bill: ServiceBill, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    bill.id.toLowerCase().includes(q) ||
    formatBillId(bill.id).toLowerCase().includes(q) ||
    bill.periodStart.toLowerCase().includes(q) ||
    bill.periodEnd.toLowerCase().includes(q) ||
    bill.totalAmount.toLowerCase().includes(q) ||
    bill.currency.toLowerCase().includes(q) ||
    bill.status.toLowerCase().includes(q) ||
    serviceBillStatusLabel(bill.status).toLowerCase().includes(q) ||
    (bill.paymentReference?.toLowerCase().includes(q) ?? false)
  );
}

export function ServiceBillsListPage({ session }: Props) {
  const navigate = useNavigate();
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const canPay = useMemo(() => sessionCanCheckoutServiceBill(session), [session]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ServiceBill[]>(
    () => peekMerchantServiceBills() ?? [],
  );
  const [commercial, setCommercial] = useState<MerchantCommercialSettings | null>(
    null,
  );
  const [agentName, setAgentName] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => peekMerchantServiceBills() == null);
  const [hasLoaded, setHasLoaded] = useState(
    () => peekMerchantServiceBills() != null,
  );
  const [error, setError] = useState<string | null>(null);
  const [topbarCenterSlot, setTopbarCenterSlot] = useState<HTMLElement | null>(
    null,
  );

  useLayoutEffect(() => {
    setTopbarCenterSlot(document.getElementById("merchant-topbar-center"));
  }, []);

  const dismissToast = useCallback(() => setError(null), []);

  const load = useCallback(async () => {
    if (!hasLoaded) setLoading(true);
    setError(null);
    try {
      const rows = await getMerchantServiceBills();
      setItems(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load service bills");
      setItems([]);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [hasLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const row = await getMerchantCommercial(orgId);
        if (cancelled) return;
        setCommercial(row);
        const account = await getOrg(orgId);
        if (cancelled) return;
        if (account.parentId) {
          try {
            const parent = await getOrg(account.parentId);
            if (!cancelled) setAgentName(parent.name?.trim() || null);
          } catch {
            if (!cancelled) setAgentName(null);
          }
        } else if (!cancelled) {
          setAgentName(null);
        }
      } catch {
        if (!cancelled) {
          setCommercial(null);
          setAgentName(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const filtered = useMemo(
    () =>
      items.filter(
        (bill) => matchesFilter(bill, filter) && matchesQuery(bill, query),
      ),
    [items, filter, query],
  );

  const unpaidCount = useMemo(
    () =>
      items.filter((b) => b.status === "issued" || b.status === "overdue").length,
    [items],
  );
  const overdueCount = useMemo(
    () => items.filter((b) => b.status === "overdue").length,
    [items],
  );

  const topbarFilters = topbarCenterSlot
    ? createPortal(
        <div className="plat-bills-topbar" aria-label="Service bill filters">
          <div
            className="org-agents__pills plat-orders-topbar__pills plat-bills-topbar__pills"
            role="group"
            aria-label="Status filter"
          >
            {STATUS_PILLS.map((pill) => {
              let label = pill.label;
              if (pill.id === "unpaid" && unpaidCount > 0) {
                label = `Unpaid (${unpaidCount})`;
              }
              if (pill.id === "overdue" && overdueCount > 0) {
                label = `Overdue (${overdueCount})`;
              }
              return (
                <button
                  key={pill.id}
                  type="button"
                  className={`org-agents__pill${filter === pill.id ? " is-active" : ""}`}
                  aria-pressed={filter === pill.id}
                  onClick={() => setFilter(pill.id)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <label className="org-agents__search-wrap plat-bills__search-wrap plat-orders-topbar__search plat-bills-topbar__search">
            <span className="org-agents__search-icon" aria-hidden>
              <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search bill ID, period, or amount"
              aria-label="Search service bills"
            />
          </label>
          <span className="plat-bills-topbar__balance" aria-hidden />
        </div>,
        topbarCenterSlot,
      )
    : null;

  return (
    <div className="plat-bills">
      {topbarFilters}
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />

      <section className="plat-bills__plan" aria-label="Fee and billing">
        <div className="plat-bills__plan-head">
          <div>
            <h2 className="plat-bills__plan-title">Fee &amp; billing</h2>
            <p className="plat-bills__plan-copy">
              Platform fee tier and volume rate — display only. Changes come from
              your agent or PaymentGate platform.
            </p>
          </div>
        </div>
        <div className="plat-bills__plan-stats">
          <article className="plat-bills__plan-stat">
            <span className="plat-bills__plan-label">Tier</span>
            <strong className="plat-bills__plan-value">
              {commercial ? tierLabel(commercial.tier) : "—"}
            </strong>
          </article>
          <article className="plat-bills__plan-stat">
            <span className="plat-bills__plan-label">Volume fee</span>
            <strong className="plat-bills__plan-value">
              {commercial ? `${commercial.volumeFeePercent}%` : "—"}
            </strong>
            <span className="plat-bills__plan-hint">
              Not deducted from payer on-chain
            </span>
          </article>
          <article className="plat-bills__plan-stat">
            <span className="plat-bills__plan-label">Subscription</span>
            <strong className="plat-bills__plan-value">
              {commercial ? `$${commercial.subscriptionAmountUsd}` : "—"}
            </strong>
            <span className="plat-bills__plan-hint">per month</span>
          </article>
          <article className="plat-bills__plan-stat">
            <span className="plat-bills__plan-label">Next period rate</span>
            <strong className="plat-bills__plan-value">
              {commercial?.pendingVolumeFeePercent
                ? `${commercial.pendingVolumeFeePercent}%`
                : "—"}
            </strong>
            {agentName ? (
              <span className="plat-bills__plan-hint">Agent · {agentName}</span>
            ) : null}
          </article>
        </div>
        {commercial?.enterpriseApprovalStatus === "pending" ? (
          <p className="plat-bills__plan-notice" role="status">
            Custom Enterprise rate awaits platform Owner review.
          </p>
        ) : null}
      </section>

      <div className="plat-bills__table-wrap">
        {loading && !hasLoaded ? (
          <PagePending />
        ) : null}

        {!loading && filtered.length === 0 ? (
          <p className="plat-bills__empty">
            {filter !== "all" || query.trim()
              ? "No service bills match this filter."
              : "No service bills yet. Platform SaaS invoices appear here when issued."}
          </p>
        ) : null}

        {!loading && filtered.length > 0 ? (
          <table className="plat-bills__table">
            <thead>
              <tr>
                <th>Bill ID</th>
                <th>Period</th>
                <th>Amount</th>
                <th>Due date</th>
                <th>Status</th>
                {canPay ? <th className="plat-bills__th-action" aria-label="Actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((bill, index) => {
                const overdue = bill.status === "overdue";
                const payable = bill.status === "issued" || bill.status === "overdue";
                const href = merchantRoute(`service-bills/${bill.id}`);
                return (
                  <tr
                    key={bill.id}
                    className="plat-bills__row"
                    style={{ animationDelay: `${Math.min(index, 24) * 40}ms` }}
                    tabIndex={0}
                    role="link"
                    aria-label={`Open bill ${formatBillId(bill.id)}`}
                    onMouseEnter={() => void getCachedServiceBill(bill.id)}
                    onFocus={() => void getCachedServiceBill(bill.id)}
                    onClick={() => navigate(href)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(href);
                      }
                    }}
                  >
                    <td>
                      <Link
                        className="plat-bills__id"
                        to={href}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {formatBillId(bill.id)}
                      </Link>
                    </td>
                    <td className="plat-bills__created">
                      {bill.periodStart}
                      <span className="plat-bills__period-sep" aria-hidden>
                        {" "}
                        →{" "}
                      </span>
                      {bill.periodEnd}
                    </td>
                    <td className="plat-bills__amount">
                      <FundAmount amount={bill.totalAmount} />
                      <span className="plat-bills__currency muted">{bill.currency}</span>
                    </td>
                    <td
                      className={
                        overdue ? "plat-bills__due is-overdue" : "plat-bills__due"
                      }
                    >
                      {formatShortDate(bill.dueAt)}
                    </td>
                    <td>
                      <span
                        className={`plat-bills__badge tone-${serviceBillStatusTone(
                          bill.status,
                        )}${overdue ? " is-pulse" : ""}`}
                      >
                        {serviceBillStatusLabel(bill.status)}
                      </span>
                    </td>
                    {canPay ? (
                      <td className="plat-bills__td-action">
                        {payable ? (
                          <Link
                            className="plat-bills__pay"
                            to={href}
                            state={{ openCheckout: true }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Pay
                          </Link>
                        ) : (
                          <span className="plat-bills__action-dash muted" aria-hidden>
                            —
                          </span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
