import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
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
import { OrgListPagination } from "../platform/OrgListPagination";
import {
  getServiceBillsSummary,
  listServiceBillsServer,
  peekServiceBillsServer,
  peekServiceBillsSummary,
  type ServiceBillBucket,
  type ServiceBillsListParams,
  type ServiceBillsSummary,
  OPEN_ACTIVATION_QUERY as ACTIVATION_QUERY,
} from "../shared/serviceBillsServer";
import type { ServerPage } from "../shared/serverListApi";
import { useDebouncedValue } from "../shared/useDebouncedValue";
import { getCachedServiceBill } from "../shared/serviceBillDetailCache";
import { formatShortDate } from "../platform/org";
import { tierLabel } from "../commercialLabels";
import {
  formatBillId,
  isActivationServiceBill,
  isOpenActivationServiceBill,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";
import {
  primaryMerchantOrgId,
  sessionCanCheckoutServiceBill,
} from "./org";
import {
  ACTIVATION_PAYMENT_LOCKED_HINT,
  sessionNeedsActivationPayment,
} from "../auth/contactVerification";

type Filter = "all" | "overdue" | "unpaid" | "paid";

const PAGE_SIZE = 10;

const FILTER_BUCKET: Record<Filter, ServiceBillBucket> = {
  all: "all",
  unpaid: "open",
  overdue: "late",
  paid: "paid",
};

const NO_WINDOW = {};


const STATUS_PILLS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unpaid", label: "Unpaid" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
];

type Props = { session: Session };

export function ServiceBillsListPage({ session }: Props) {
  const navigate = useNavigate();
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const canPay = useMemo(() => sessionCanCheckoutServiceBill(session), [session]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const filterKey = `${filter}|${debouncedQuery}`;
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = useCallback(
    (next: number) => setPageState({ key: filterKey, page: next }),
    [filterKey],
  );
  const listParams = useMemo<ServiceBillsListParams>(
    () => ({
      bucket: FILTER_BUCKET[filter],
      q: debouncedQuery,
      sort: "activationFirst",
      dir: "desc",
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [filter, debouncedQuery, page],
  );
  const [pageData, setPageData] = useState<ServerPage<ServiceBill> | null>(() =>
    peekServiceBillsServer<ServiceBill>(listParams),
  );
  const [summary, setSummary] = useState<ServiceBillsSummary | null>(() =>
    peekServiceBillsSummary(NO_WINDOW),
  );
  const [openActivation, setOpenActivation] = useState<ServiceBill | null>(
    () => peekServiceBillsServer<ServiceBill>(ACTIVATION_QUERY)?.items[0] ?? null,
  );
  const listSeq = useRef(0);
  const [commercial, setCommercial] = useState<MerchantCommercialSettings | null>(
    null,
  );
  const [agentName, setAgentName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topbarCenterSlot, setTopbarCenterSlot] = useState<HTMLElement | null>(
    null,
  );

  useLayoutEffect(() => {
    setTopbarCenterSlot(document.getElementById("merchant-topbar-center"));
  }, []);

  const dismissToast = useCallback(() => setError(null), []);

  const loadList = useCallback(async (params: ServiceBillsListParams) => {
    const seq = ++listSeq.current;
    const cached = peekServiceBillsServer<ServiceBill>(params);
    if (cached) setPageData(cached);
    try {
      const result = await listServiceBillsServer<ServiceBill>(params);
      if (seq === listSeq.current) setPageData(result);
    } catch (err) {
      if (seq !== listSeq.current) return;
      setError(err instanceof ApiError ? err.message : "Failed to load service bills");
      setPageData((prev) => prev ?? { items: [], total: 0, limit: PAGE_SIZE, offset: 0 });
    }
  }, []);

  useEffect(() => {
    void loadList(listParams);
  }, [loadList, listParams]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getServiceBillsSummary(NO_WINDOW).catch(() => null),
      listServiceBillsServer<ServiceBill>(ACTIVATION_QUERY).catch(() => null),
    ]).then(([nextSummary, activation]) => {
      if (cancelled) return;
      if (nextSummary) setSummary(nextSummary);
      if (activation) setOpenActivation(activation.items[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = pageData == null;
  const filtered = pageData?.items ?? [];
  const total = pageData?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (pageData && page > pageCount) setPage(pageCount);
  }, [pageData, page, pageCount, setPage]);

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

  const needsActivationPay = useMemo(
    () => sessionNeedsActivationPayment(session),
    [session],
  );

  const unpaidCount = summary?.counts.open ?? 0;
  const overdueCount = summary?.counts.late ?? 0;

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
        {commercial?.nextInvoiceOn ? (
          <p className="plat-bills__plan-hint" style={{ marginTop: "0.75rem" }}>
            Next subscription invoice on <strong>{commercial.nextInvoiceOn}</strong>
            {commercial.billingAnchorAt
              ? ` · billing anchor ${String(commercial.billingAnchorAt).slice(0, 10)}`
              : ""}
          </p>
        ) : needsActivationPay ? (
          <p className="plat-bills__plan-hint" style={{ marginTop: "0.75rem" }}>
            Billing schedule starts after activation is paid.
          </p>
        ) : null}
      </section>

      {needsActivationPay || openActivation ? (
        <div
          className="plat-bills__activation-callout"
          role="status"
        >
          <div>
            <strong>Account activation</strong>
            <p>
              {openActivation?.status === "draft"
                ? "Your activation invoice is a draft. PaymentGate must Confirm & send before you can pay (or enable auto-send)."
                : ACTIVATION_PAYMENT_LOCKED_HINT}
            </p>
          </div>
          {openActivation ? (
            <Link
              className="btn-primary btn-inline"
              to={merchantRoute(`service-bills/${openActivation.id}`)}
              state={
                openActivation.status === "issued" ||
                openActivation.status === "overdue"
                  ? { openCheckout: true }
                  : undefined
              }
            >
              {openActivation.status === "issued" ||
              openActivation.status === "overdue"
                ? "Pay activation"
                : "View activation invoice"}
            </Link>
          ) : (
            <Link
              className="btn-ghost btn-inline"
              to={merchantRoute("service-bills")}
              onClick={() => setFilter("unpaid")}
            >
              Show unpaid
            </Link>
          )}
        </div>
      ) : null}

      <div className="plat-bills__table-wrap">
        {loading ? <PagePending /> : null}

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
                <th>Subscription</th>
                <th>Volume fee</th>
                <th>Billed vol.</th>
                <th>Total</th>
                <th>Due date</th>
                <th>Status</th>
                {canPay ? <th className="plat-bills__th-action" aria-label="Actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((bill, index) => {
                const overdue = bill.status === "overdue";
                const activation = isActivationServiceBill(bill);
                const openActivationRow = isOpenActivationServiceBill(bill);
                const payable =
                  bill.status === "issued" || bill.status === "overdue";
                const href = merchantRoute(`service-bills/${bill.id}`);
                return (
                  <tr
                    key={bill.id}
                    className={`plat-bills__row${
                      openActivationRow ? " is-activation-open" : ""
                    }`}
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
                      {activation ? (
                        <span className="plat-bills__kind-tag">Activation</span>
                      ) : null}
                    </td>
                    <td className="plat-bills__created">
                      {activation ? (
                        <span>Activation fee</span>
                      ) : (
                        <>
                          {bill.periodStart}
                          <span className="plat-bills__period-sep" aria-hidden>
                            {" "}
                            →{" "}
                          </span>
                          {bill.periodEnd}
                        </>
                      )}
                    </td>
                    <td className="plat-bills__amount plat-bills__amount--sub">
                      <FundAmount amount={bill.subscriptionAmount} />
                      <span className="plat-bills__currency muted">{bill.currency}</span>
                    </td>
                    <td className="plat-bills__amount plat-bills__amount--vol">
                      <FundAmount amount={bill.volumeFeeAmount} />
                      <span className="plat-bills__currency muted">{bill.currency}</span>
                    </td>
                    <td className="plat-bills__amount plat-bills__amount--base">
                      <FundAmount amount={bill.billedVolumeUsd ?? "0.00"} />
                      <span className="plat-bills__currency muted">{bill.currency}</span>
                    </td>
                    <td className="plat-bills__amount plat-bills__amount--total">
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
                            {activation ? " activation" : ""}
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
        {!loading && total > 0 ? (
          <OrgListPagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        ) : null}
      </div>
    </div>
  );
}
