import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AssetCode } from "@paymentgate/domain";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  getBillingWalletSettings,
  getPlatformOrgs,
  getPlatformServiceBills,
  peekPlatformOrgs,
  peekPlatformServiceBills,
  type ServiceBill,
} from "./api";
import { AssetIcon } from "./cryptoIcons";
import { formatShortDate, sessionCanIssueServiceBill } from "./org";
import { truncateAddress } from "./orgDetailSeeds";
import { FundAmount } from "./FundAmount";
import type { Session } from "./api";
import { GenerateServiceBillsModal } from "./GenerateServiceBillsModal";
import { IssueServiceBillModal } from "./IssueServiceBillModal";
import {
  formatBillId,
  isActivationServiceBill,
  isOpenActivationServiceBill,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";
import { PagePending } from "./ui/PlatformPending";
import { OrgListPagination } from "./OrgListPagination";
import { platformRoute } from "../shared/portalRouting";
import {
  formatServiceBillPeriodRange,
  serviceBillManageHint,
  serviceBillPeriodOptions,
} from "../shared/serviceBillPeriod";
import {
  SortHeader,
  compareDate,
  compareNumber,
  compareText,
  toggleSortState,
  type SortState,
} from "./ui/TableArrange";

type Props = { session: Session };

type StatusFilter =
  | "all"
  | "draft"
  | "unpaid"
  | "overdue"
  | "paid"
  | "voided"
  | "cancelled"
  | "activation";

type SortKey =
  | "billId"
  | "merchant"
  | "subscription"
  | "volumeFee"
  | "billedVolume"
  | "total"
  | "dueDate"
  | "status"
  | "period"
  | "txHash"
  | "rxAddress"
  | "txAddress";

const PAGE_SIZE = 20;

const STATUS_PILLS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "activation", label: "Activation" },
  { id: "draft", label: "Draft" },
  { id: "unpaid", label: "Unpaid" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
  { id: "voided", label: "Voided" },
  { id: "cancelled", label: "Cancelled" },
];

function orgNameMap(orgs: { id: string; name: string }[]): Map<string, string> {
  return new Map(orgs.map((o) => [o.id, o.name]));
}

function matchesStatus(bill: ServiceBill, filter: StatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "activation":
      return isActivationServiceBill(bill);
    case "draft":
      return bill.status === "draft";
    case "unpaid":
      return bill.status === "issued" || bill.status === "overdue";
    case "overdue":
      return bill.status === "overdue";
    case "paid":
      return bill.status === "paid";
    case "voided":
      return bill.status === "voided";
    case "cancelled":
      return bill.status === "cancelled";
    default:
      return true;
  }
}

export function ServiceBillsListPage({ session }: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canIssue = useMemo(() => sessionCanIssueServiceBill(session), [session]);
  const [issueOpen, setIssueOpen] = useState(
    () => canIssue && searchParams.get("issue") === "1",
  );
  const [generateOpen, setGenerateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [items, setItems] = useState<ServiceBill[]>(
    () => peekPlatformServiceBills() ?? [],
  );
  const [orgNames, setOrgNames] = useState<Map<string, string>>(() => {
    const cached = peekPlatformOrgs();
    return cached ? orgNameMap(cached) : new Map();
  });
  const [billMerchants, setBillMerchants] = useState<
    { id: string; name: string; createdAt?: string }[]
  >(() => {
    const cached = peekPlatformOrgs();
    return (cached ?? [])
      .filter((o) => o.type === "merchant" && o.status !== "paused")
      .map((o) => ({ id: o.id, name: o.name, createdAt: o.createdAt }));
  });
  /** Platform remittance destination (Rx) from billing wallet settings. */
  const [rxAddress, setRxAddress] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState<SortKey>>({
    key: "dueDate",
    dir: "desc",
  });
  const [loading, setLoading] = useState(() => peekPlatformServiceBills() == null);
  const [error, setError] = useState<string | null>(null);
  const [topbarLeadingSlot, setTopbarLeadingSlot] = useState<HTMLElement | null>(
    null,
  );
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);

  const dismissToast = useCallback(() => setError(null), []);

  const closeIssueModal = useCallback(() => {
    setIssueOpen(false);
    if (searchParams.get("issue") === "1") {
      const next = new URLSearchParams(searchParams);
      next.delete("issue");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (canIssue && searchParams.get("issue") === "1") {
      setIssueOpen(true);
    }
  }, [canIssue, searchParams]);

  useLayoutEffect(() => {
    setTopbarLeadingSlot(document.getElementById("platform-topbar-leading"));
    setTopbarSlot(document.getElementById("platform-topbar-center"));
  }, []);

  const load = useCallback(async () => {
    const canUseCache = peekPlatformServiceBills() != null;
    if (!canUseCache) setLoading(true);
    setError(null);
    try {
      const [bills, orgs, billing] = await Promise.all([
        getPlatformServiceBills(),
        getPlatformOrgs(),
        getBillingWalletSettings().catch(() => null),
      ]);
      setItems(bills);
      setOrgNames(orgNameMap(orgs));
      setBillMerchants(
        orgs
          .filter((o) => o.type === "merchant" && o.status !== "paused")
          .map((o) => ({ id: o.id, name: o.name, createdAt: o.createdAt })),
      );
      setRxAddress(billing?.payTo?.trim() || null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === "rate_limited"
            ? "Too many requests — wait a moment and retry."
            : err.message
          : "Failed to load service bills",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const periodOptions = useMemo(
    () => serviceBillPeriodOptions(items),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = items.filter((bill) => {
      if (!matchesStatus(bill, statusFilter)) return false;
      if (periodFilter !== "all" && bill.periodStart !== periodFilter) return false;
      if (!q) return true;
      const merchant = (orgNames.get(bill.orgId) ?? bill.orgId).toLowerCase();
      const billId = formatBillId(bill.id).toLowerCase();
      const txHash = (bill.paymentReference ?? "").toLowerCase();
      const rx = (bill.rxAddress ?? rxAddress ?? "").toLowerCase();
      const tx = (bill.txAddress ?? "").toLowerCase();
      return (
        billId.includes(q) ||
        bill.id.toLowerCase().includes(q) ||
        merchant.includes(q) ||
        (txHash.length > 0 && txHash.includes(q)) ||
        (rx.length > 0 && rx.includes(q)) ||
        (tx.length > 0 && tx.includes(q))
      );
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    const merchantOf = (bill: ServiceBill) =>
      orgNames.get(bill.orgId) ?? bill.orgId;
    return [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case "billId":
          cmp = compareText(formatBillId(a.id), formatBillId(b.id));
          break;
        case "merchant":
          cmp = compareText(merchantOf(a), merchantOf(b));
          break;
        case "subscription":
          cmp = compareNumber(
            Number(a.subscriptionAmount),
            Number(b.subscriptionAmount),
          );
          break;
        case "volumeFee":
          cmp = compareNumber(
            Number(a.volumeFeeAmount),
            Number(b.volumeFeeAmount),
          );
          break;
        case "billedVolume":
          cmp = compareNumber(
            Number(a.billedVolumeUsd ?? 0),
            Number(b.billedVolumeUsd ?? 0),
          );
          break;
        case "total":
          cmp = compareNumber(Number(a.totalAmount), Number(b.totalAmount));
          break;
        case "status":
          cmp = compareText(
            serviceBillStatusLabel(a.status),
            serviceBillStatusLabel(b.status),
          );
          break;
        case "period":
          cmp = compareText(a.periodStart, b.periodStart);
          break;
        case "txHash":
          cmp = compareText(a.paymentReference ?? "", b.paymentReference ?? "");
          break;
        case "rxAddress":
          cmp = compareText(
            a.rxAddress ?? rxAddress ?? "",
            b.rxAddress ?? rxAddress ?? "",
          );
          break;
        case "txAddress":
          cmp = compareText(a.txAddress ?? "", b.txAddress ?? "");
          break;
        case "dueDate":
        default:
          cmp = compareDate(a.dueAt, b.dueAt);
          break;
      }
      if (cmp !== 0) return dir * cmp;
      return dir * compareDate(a.dueAt, b.dueAt);
    });
  }, [items, orgNames, query, statusFilter, periodFilter, sort, rxAddress]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, periodFilter, sort]);

  const onSort = useCallback((key: SortKey) => {
    setSort((prev) =>
      toggleSortState(
        prev,
        key,
        key === "dueDate" || key === "total" || key === "period"
          ? "desc"
          : "asc",
      ),
    );
  }, []);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const unpaidCount = useMemo(
    () => items.filter((b) => b.status === "issued" || b.status === "overdue").length,
    [items],
  );
  const overdueCount = useMemo(
    () => items.filter((b) => b.status === "overdue").length,
    [items],
  );
  const draftCount = useMemo(
    () => items.filter((b) => b.status === "draft").length,
    [items],
  );
  const openActivationCount = useMemo(
    () => items.filter((b) => isOpenActivationServiceBill(b)).length,
    [items],
  );
  const openArUsd = useMemo(() => {
    return items
      .filter((b) => b.status === "issued" || b.status === "overdue")
      .reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
  }, [items]);
  const overdueArUsd = useMemo(() => {
    return items
      .filter((b) => b.status === "overdue")
      .reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
  }, [items]);

  return (
    <div className="plat-bills">
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />

      <div className="plat-bills__kpi" role="group" aria-label="Service bills AR">
        <div className="plat-bills__kpi-card">
          <p className="plat-bills__kpi-label">Open AR</p>
          <p className="plat-bills__kpi-value">
            <FundAmount amount={openArUsd.toFixed(2)} />
          </p>
          <p className="plat-bills__kpi-meta">{unpaidCount} unpaid</p>
        </div>
        <div className="plat-bills__kpi-card">
          <p className="plat-bills__kpi-label">Overdue</p>
          <p className="plat-bills__kpi-value">
            <FundAmount amount={overdueArUsd.toFixed(2)} />
          </p>
          <p className="plat-bills__kpi-meta">{overdueCount} bills</p>
        </div>
        <div className="plat-bills__kpi-card">
          <p className="plat-bills__kpi-label">Drafts awaiting send</p>
          <p className="plat-bills__kpi-value">{draftCount}</p>
          <p className="plat-bills__kpi-meta">Confirm before merchant sees</p>
        </div>
        <div
          className={`plat-bills__kpi-card${
            openActivationCount > 0 ? " is-clickable" : ""
          }`}
          role={openActivationCount > 0 ? "button" : undefined}
          tabIndex={openActivationCount > 0 ? 0 : undefined}
          onClick={
            openActivationCount > 0
              ? () => setStatusFilter("activation")
              : undefined
          }
          onKeyDown={
            openActivationCount > 0
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setStatusFilter("activation");
                  }
                }
              : undefined
          }
          title={
            openActivationCount > 0
              ? "Filter to open activation invoices"
              : undefined
          }
        >
          <p className="plat-bills__kpi-label">Open activation</p>
          <p className="plat-bills__kpi-value">{openActivationCount}</p>
          <p className="plat-bills__kpi-meta">Gate until mark paid</p>
        </div>
      </div>

      {openActivationCount > 0 ? (
        <div className="plat-bills__activation-callout" role="status">
          <div>
            <strong>Activation queue</strong>
            <p>
              {openActivationCount === 1
                ? "1 merchant is gated on an unpaid activation invoice."
                : `${openActivationCount} merchants are gated on unpaid activation invoices.`}{" "}
              Mark paid to unlock live features and set the billing anchor.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary btn-inline"
            onClick={() => setStatusFilter("activation")}
          >
            Show activation
          </button>
        </div>
      ) : null}

      {topbarLeadingSlot
        ? createPortal(
            <span className="plat-topbar-mark" title="Service bills">
              <AssetIcon asset={AssetCode.USDT} />
            </span>,
            topbarLeadingSlot,
          )
        : null}

      {topbarSlot
        ? createPortal(
            <label className="topbar-search">
              <svg
                className="topbar-search__icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                className="topbar-search__input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search bill ID, merchant, Tx hash, or Rx address"
                aria-label="Search service bills by bill ID, merchant, Tx hash, or Rx address"
                autoComplete="off"
                spellCheck={false}
              />
            </label>,
            topbarSlot,
          )
        : null}

      <div className="plat-bills__toolbar plat-bills__toolbar--tabs">
        <div
          className="b3-agent-detail__tabs plat-bills__tabs"
          role="tablist"
          aria-label="Status filter"
        >
          {STATUS_PILLS.map((pill) => {
            let label = pill.label;
            if (pill.id === "activation" && openActivationCount > 0) {
              label = `Activation (${openActivationCount})`;
            }
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
                role="tab"
                className={`b3-agent-detail__tab${
                  statusFilter === pill.id ? " is-active" : ""
                }`}
                aria-selected={statusFilter === pill.id}
                onClick={() => setStatusFilter(pill.id)}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="plat-bills__toolbar-end">
          <label className="plat-bills__period-filter plat-bills__period-filter--wide">
            <span className="sr-only">Billing period</span>
            <select
              className="field-control"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              aria-label="Filter by billing period"
            >
              <option value="all">All periods</option>
              {periodOptions.map((opt) => (
                <option key={opt.start} value={opt.start}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="plat-bills__period-filter-icon" aria-hidden>
              <svg viewBox="0 0 10 6" width="10" height="6" fill="none">
                <path
                  d="M1 1l4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </label>
          {canIssue ? (
            <details className="plat-bills__more">
              <summary className="btn-secondary plat-bills__action-btn plat-bills__more-summary">
                More
              </summary>
              <div className="plat-bills__more-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="plat-bills__more-item"
                  onClick={(e) => {
                    const root = (e.currentTarget as HTMLElement).closest(
                      "details",
                    );
                    if (root instanceof HTMLDetailsElement) root.open = false;
                    setGenerateOpen(true);
                  }}
                >
                  Backfill month…
                  <span className="plat-bills__more-hint">
                    Ops override if the daily job missed merchants
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="plat-bills__more-item"
                  onClick={(e) => {
                    const root = (e.currentTarget as HTMLElement).closest(
                      "details",
                    );
                    if (root instanceof HTMLDetailsElement) root.open = false;
                    setIssueOpen(true);
                  }}
                >
                  One-off bill…
                  <span className="plat-bills__more-hint">
                    Rare special charge — not the monthly cycle
                  </span>
                </button>
              </div>
            </details>
          ) : null}
        </div>
      </div>

      <p className="plat-bills__legend">
        Recurring invoices are created automatically each day (draft, or sent if
        auto-send is on). Open a bill to send, adjust, cancel, or mark paid.
        Amounts are platform SaaS fees: subscription plus volume on completed
        payment orders (<strong>Billed vol.</strong>) — not guest payment totals.
      </p>

      <div className="plat-bills__table-wrap">
        {loading ? (
          <PagePending />
        ) : null}
        {!loading && filtered.length === 0 ? (
          <p className="plat-bills__empty">
            {query.trim()
              ? "No service bills match that bill ID, merchant, Tx hash, or Rx address."
              : statusFilter !== "all" || periodFilter !== "all"
                ? "No service bills for the selected status or period."
                : "No service bills yet. Recurring invoices appear automatically after merchants activate and each billing cycle runs."}
          </p>
        ) : null}
        {!loading && filtered.length > 0 ? (
          <table className="plat-bills__table">
            <thead>
              <tr>
                <th>
                  <SortHeader
                    label="Bill ID"
                    sortKey="billId"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Merchant"
                    sortKey="merchant"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Subscription"
                    sortKey="subscription"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Volume fee"
                    sortKey="volumeFee"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Billed vol."
                    sortKey="billedVolume"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Total"
                    sortKey="total"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Due Date"
                    sortKey="dueDate"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Status"
                    sortKey="status"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Period"
                    sortKey="period"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Tx hash"
                    sortKey="txHash"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Rx address"
                    sortKey="rxAddress"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Tx address"
                    sortKey="txAddress"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.map((bill, index) => {
                const overdue = bill.status === "overdue";
                const activation = isActivationServiceBill(bill);
                const openActivation = isOpenActivationServiceBill(bill);
                const href = platformRoute(`service-bills/${bill.id}`);
                const txHash = bill.paymentReference?.trim() || "";
                const rowRx = bill.rxAddress?.trim() || rxAddress || "";
                const rowTx = bill.txAddress?.trim() || "";
                return (
                  <tr
                    key={bill.id}
                    className={`plat-bills__row${
                      openActivation ? " is-activation-open" : ""
                    }`}
                    style={{ animationDelay: `${Math.min(index, 24) * 40}ms` }}
                    tabIndex={0}
                    role="link"
                    aria-label={`Open bill ${formatBillId(bill.id)}`}
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
                      {(() => {
                        const hint = serviceBillManageHint(bill.status);
                        return hint ? (
                          <span className="plat-bills__manage-hint">{hint}</span>
                        ) : null;
                      })()}
                    </td>
                    <td className="plat-bills__merchant">
                      {orgNames.get(bill.orgId) ?? bill.orgId}
                    </td>
                    <td className="plat-bills__amount plat-bills__amount--sub">
                      <FundAmount amount={bill.subscriptionAmount} />
                    </td>
                    <td className="plat-bills__amount plat-bills__amount--vol">
                      <FundAmount amount={bill.volumeFeeAmount} />
                    </td>
                    <td className="plat-bills__amount plat-bills__amount--base">
                      <FundAmount amount={bill.billedVolumeUsd ?? "0.00"} />
                    </td>
                    <td className="plat-bills__amount plat-bills__amount--total">
                      <FundAmount amount={bill.totalAmount} />
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
                        className={`plat-bills__badge tone-${serviceBillStatusTone(bill.status)}${
                          overdue ? " is-pulse" : ""
                        }`}
                      >
                        {serviceBillStatusLabel(bill.status)}
                      </span>
                    </td>
                    <td className="plat-bills__created">
                      {activation ? (
                        <span>Activation fee</span>
                      ) : (
                        formatServiceBillPeriodRange(
                          bill.periodStart,
                          bill.periodEnd,
                        )
                      )}
                    </td>
                    <td className="plat-bills__tx" title={txHash || undefined}>
                      {txHash ? <code>{truncateAddress(txHash, 8, 6)}</code> : "—"}
                    </td>
                    <td className="plat-bills__addr" title={rowRx || undefined}>
                      {rowRx ? <code>{truncateAddress(rowRx)}</code> : "—"}
                    </td>
                    <td className="plat-bills__addr" title={rowTx || undefined}>
                      {rowTx ? <code>{truncateAddress(rowTx)}</code> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
        {!loading && filtered.length > 0 ? (
          <OrgListPagination
            page={page}
            pageCount={pageCount}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        ) : null}
      </div>

      {canIssue ? (
        <>
          <IssueServiceBillModal
            open={issueOpen}
            onClose={closeIssueModal}
            onIssued={() => void load()}
          />
          <GenerateServiceBillsModal
            open={generateOpen}
            orgNames={orgNames}
            merchants={billMerchants}
            onClose={() => setGenerateOpen(false)}
            onGenerated={() => void load()}
          />
        </>
      ) : null}
    </div>
  );
}
