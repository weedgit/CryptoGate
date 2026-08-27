import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
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
import {
  formatBillId,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";
import { PlatformPending, PlatformTableSkeleton } from "./ui/PlatformPending";
import { OrgListPagination } from "./OrgListPagination";

type Props = { session: Session };

const PAGE_SIZE = 15;

function orgNameMap(orgs: { id: string; name: string }[]): Map<string, string> {
  return new Map(orgs.map((o) => [o.id, o.name]));
}

export function ServiceBillsListPage({ session }: Props) {
  const navigate = useNavigate();
  const canIssue = useMemo(() => sessionCanIssueServiceBill(session), [session]);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((bill) => {
      const merchant = (orgNames.get(bill.orgId) ?? bill.orgId).toLowerCase();
      const billId = formatBillId(bill.id).toLowerCase();
      return (
        billId.includes(q) ||
        bill.id.toLowerCase().includes(q) ||
        merchant.includes(q)
      );
    });
  }, [items, orgNames, query]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

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
                <Link
                  className="btn-primary org-agents__cta"
                  to="/platform/service-bills/new"
                >
                  + Create Bill
                </Link>
              ) : null}
            </div>,
            topbarActionsSlot,
          )
        : null}

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
            {query.trim()
              ? "No service bills match this search."
              : "No service bills yet."}
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
    </div>
  );
}
