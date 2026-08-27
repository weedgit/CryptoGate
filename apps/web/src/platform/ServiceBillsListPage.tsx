import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AssetCode } from "@cryptogate/domain";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  getPlatformOrgs,
  getPlatformServiceBills,
  peekPlatformOrgs,
  peekPlatformServiceBills,
  type ServiceBill,
} from "./api";
import { AssetIcon } from "./cryptoIcons";
import { formatShortDate, sessionCanIssueServiceBill } from "./org";
import { FundAmount } from "./FundAmount";
import type { Session } from "./api";
import { GenerateServiceBillsModal } from "./GenerateServiceBillsModal";
import { IssueServiceBillModal } from "./IssueServiceBillModal";
import {
  formatBillId,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";
import { PlatformPending, PlatformTableSkeleton } from "./ui/PlatformPending";
import { OrgListPagination } from "./OrgListPagination";

type Props = { session: Session };

type StatusFilter = "all" | "unpaid" | "overdue" | "paid" | "voided";

const PAGE_SIZE = 15;

const STATUS_PILLS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unpaid", label: "Unpaid" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
  { id: "voided", label: "Voided" },
];

function orgNameMap(orgs: { id: string; name: string }[]): Map<string, string> {
  return new Map(orgs.map((o) => [o.id, o.name]));
}

function matchesStatus(bill: ServiceBill, filter: StatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "unpaid":
      return bill.status === "issued" || bill.status === "overdue";
    case "overdue":
      return bill.status === "overdue";
    case "paid":
      return bill.status === "paid";
    case "voided":
      return bill.status === "voided";
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
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(() => peekPlatformServiceBills() == null);
  const [error, setError] = useState<string | null>(null);
  const [topbarLeadingSlot, setTopbarLeadingSlot] = useState<HTMLElement | null>(
    null,
  );
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] = useState<HTMLElement | null>(
    null,
  );

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
    setTopbarActionsSlot(document.getElementById("platform-topbar-actions"));
  }, []);

  const load = useCallback(async () => {
    const canUseCache = peekPlatformServiceBills() != null;
    if (!canUseCache) setLoading(true);
    setError(null);
    try {
      const [bills, orgs] = await Promise.all([
        getPlatformServiceBills(),
        getPlatformOrgs(),
      ]);
      setItems(bills);
      setOrgNames(orgNameMap(orgs));
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

  const periodOptions = useMemo(() => {
    const set = new Set<string>();
    for (const bill of items) {
      if (bill.periodStart) set.add(bill.periodStart);
    }
    return [...set].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((bill) => {
      if (!matchesStatus(bill, statusFilter)) return false;
      if (periodFilter !== "all" && bill.periodStart !== periodFilter) return false;
      if (!q) return true;
      const merchant = (orgNames.get(bill.orgId) ?? bill.orgId).toLowerCase();
      const billId = formatBillId(bill.id).toLowerCase();
      return (
        billId.includes(q) ||
        bill.id.toLowerCase().includes(q) ||
        merchant.includes(q)
      );
    });
  }, [items, orgNames, query, statusFilter, periodFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, periodFilter]);

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

  return (
    <div className="plat-bills">
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />

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
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search bill ID or merchant"
                aria-label="Search service bills"
              />
            </label>,
            topbarSlot,
          )
        : null}

      {topbarActionsSlot
        ? createPortal(
            <div className="org-agents__actions" aria-label="Service bill actions">
              {canIssue ? (
                <>
                  <button
                    type="button"
                    className="btn-secondary org-agents__cta"
                    onClick={() => setGenerateOpen(true)}
                  >
                    Generate period
                  </button>
                  <button
                    type="button"
                    className="btn-primary org-agents__cta"
                    onClick={() => setIssueOpen(true)}
                  >
                    + Create Bill
                  </button>
                </>
              ) : null}
            </div>,
            topbarActionsSlot,
          )
        : null}

      <div className="plat-bills__toolbar">
        <div className="org-agents__pills" role="group" aria-label="Status filter">
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
                className={`org-agents__pill${statusFilter === pill.id ? " is-active" : ""}`}
                aria-pressed={statusFilter === pill.id}
                onClick={() => setStatusFilter(pill.id)}
              >
                {label}
              </button>
            );
          })}
        </div>
        <label className="plat-bills__period-filter">
          <span className="sr-only">Billing period</span>
          <select
            className="field-control"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            aria-label="Filter by billing period"
          >
            <option value="all">All periods</option>
            {periodOptions.map((start) => (
              <option key={start} value={start}>
                {start}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="plat-bills__table-wrap">
        {loading ? (
          <div className="plat-bills__pending">
            <PlatformPending
              compact
              title="Loading service bills"
              copy="Fetching invoices and merchant names."
            />
            <PlatformTableSkeleton columns={6} rows={8} />
          </div>
        ) : null}
        {!loading && filtered.length === 0 ? (
          <p className="plat-bills__empty">
            {query.trim() || statusFilter !== "all" || periodFilter !== "all"
              ? "No service bills match this filter."
              : "No service bills yet. Use Generate period for the monthly batch."}
          </p>
        ) : null}
        {!loading && filtered.length > 0 ? (
          <table className="plat-bills__table">
            <thead>
              <tr>
                <th>Bill ID</th>
                <th>Merchant</th>
                <th>Amount</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Period</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((bill, index) => {
                const overdue = bill.status === "overdue";
                const href = `/platform/service-bills/${bill.id}`;
                return (
                  <tr
                    key={bill.id}
                    className="plat-bills__row"
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
                    </td>
                    <td className="plat-bills__merchant">
                      {orgNames.get(bill.orgId) ?? bill.orgId}
                    </td>
                    <td className="plat-bills__amount">
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
                    <td className="plat-bills__created">{bill.periodStart}</td>
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
            onClose={() => setGenerateOpen(false)}
            onGenerated={() => void load()}
          />
        </>
      ) : null}
    </div>
  );
}
