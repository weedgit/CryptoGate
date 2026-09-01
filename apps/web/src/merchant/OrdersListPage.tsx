import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { merchantRoute } from "../shared/portalRouting";
import { AuthToast } from "../auth/AuthToast";
import { FundAmount } from "../platform/FundAmount";
import { OrgListPagination } from "../platform/OrgListPagination";
import {
  PlatformPending,
  PlatformTableSkeleton,
} from "../platform/ui/PlatformPending";
import {
  ApiError,
  ordersCsvUrl,
  type PaymentOrder,
  type Session,
} from "./api";
import { getMerchantOrders, invalidateMerchantOrdersList, peekMerchantOrders } from "./merchantOrdersList";
import { getMerchantOrder } from "./merchantOrderDetail";
import { getMerchantOrderPayment } from "./merchantOrderPaymentDetails";
import { matchingModeLabel } from "./matchingLabels";
import {
  formatShortTime,
  orderStatusLabel,
  orderStatusTone,
} from "./orderStatus";
import { sessionCanExportOrders, sessionIsCashierOnly, truncateAddress } from "./org";
import { displayNetworkForPair } from "../shared/assetNetworks";
import { NetworkIcon } from "../platform/cryptoIcons";

type StatusFilter =
  | "all"
  | "pending"
  | "verifying"
  | "completed"
  | "expired"
  | "anomalies";

type PeriodFilter = "all" | "today" | "7d" | "30d" | "90d";

type SortKey =
  | "orderNumber"
  | "reference"
  | "expiresAt"
  | "amount"
  | "network"
  | "mode"
  | "createdBy"
  | "status"
  | "createdAt";

type SortDir = "asc" | "desc";

type Props = { session: Session };

const PAGE_SIZE = 20;

const STATUS_PILLS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "verifying", label: "Verifying" },
  { id: "completed", label: "Completed" },
  { id: "expired", label: "Expired" },
  { id: "anomalies", label: "Anomalies" },
];

const PERIOD_OPTIONS: { id: PeriodFilter; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
];

function truncateRef(value: string, max = 28): string {
  const t = value.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function inPeriod(iso: string | undefined, period: PeriodFilter): boolean {
  if (period === "all" || !iso) return true;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return true;
  const now = Date.now();
  const day = 86_400_000;
  switch (period) {
    case "today":
      return t >= startOfTodayMs();
    case "7d":
      return t >= now - 7 * day;
    case "30d":
      return t >= now - 30 * day;
    case "90d":
      return t >= now - 90 * day;
    default:
      return true;
  }
}

function matchesStatusFilter(order: PaymentOrder, filter: StatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "pending":
      return order.status === "pending_payment" || order.status === "pending";
    case "verifying":
      return order.status === "verifying";
    case "completed":
      return order.status === "completed" || order.status === "confirmed";
    case "expired":
      return order.status === "expired";
    case "anomalies":
      return order.status === "payment_anomaly";
    default:
      return true;
  }
}

function createdByDisplay(order: PaymentOrder): string {
  const email = order.createdByEmail?.trim();
  if (email) return email;
  if (order.createdBy?.trim()) return "Staff";
  return "—";
}

/** Match search against every visible orders-table column value. */
function matchesOrderQuery(order: PaymentOrder, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    order.orderNumber,
    order.id,
    order.merchantReference ?? "",
    order.expiresAt,
    formatShortTime(order.expiresAt),
    `exp ${formatShortTime(order.expiresAt)}`,
    order.createdAt ?? "",
    order.createdAt ? formatShortTime(order.createdAt) : "",
    order.payableAmount.amount,
    order.payableAmount.currency,
    order.asset,
    `${order.payableAmount.amount} ${order.asset}`,
    order.network,
    displayNetworkForPair(order.asset, order.network),
    order.receiveAddress,
    truncateAddress(order.receiveAddress),
    order.matchingMode,
    matchingModeLabel(order.matchingMode),
    `Mode ${order.matchingMode}`,
    createdByDisplay(order),
    order.createdByEmail ?? "",
    order.createdBy ?? "",
    order.status,
    orderStatusLabel(order.status, order),
    order.anomalyReason ?? "",
    order.anomalyResolutionNote ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

function compareText(a: string, b: string, dir: SortDir): number {
  const cmp = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function compareOrders(a: PaymentOrder, b: PaymentOrder, key: SortKey, dir: SortDir): number {
  switch (key) {
    case "orderNumber":
      return compareText(a.orderNumber, b.orderNumber, dir);
    case "reference":
      return compareText(a.merchantReference?.trim() ?? "", b.merchantReference?.trim() ?? "", dir);
    case "expiresAt":
      return compareText(a.expiresAt, b.expiresAt, dir);
    case "amount": {
      const na = Number.parseFloat(a.payableAmount.amount);
      const nb = Number.parseFloat(b.payableAmount.amount);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) {
        return dir === "asc" ? na - nb : nb - na;
      }
      return compareText(a.payableAmount.amount, b.payableAmount.amount, dir);
    }
    case "network":
      return compareText(
        displayNetworkForPair(a.asset, a.network),
        displayNetworkForPair(b.asset, b.network),
        dir,
      );
    case "mode":
      return compareText(matchingModeLabel(a.matchingMode), matchingModeLabel(b.matchingMode), dir);
    case "createdBy":
      return compareText(createdByDisplay(a), createdByDisplay(b), dir);
    case "status":
      return compareText(
        orderStatusLabel(a.status, a),
        orderStatusLabel(b.status, b),
        dir,
      );
    case "createdAt":
    default:
      return compareText(a.createdAt ?? a.expiresAt, b.createdAt ?? b.expiresAt, dir);
  }
}

function ArrangeIcon({ dir }: { dir: SortDir | null }) {
  const showUp = dir === null || dir === "asc";
  const showDown = dir === null || dir === "desc";
  return (
    <span
      className={`plat-pair-table__arrange${dir ? " is-active" : " is-idle"}`}
      aria-hidden="true"
    >
      {showUp ? (
        <svg
          className={`plat-pair-table__arrange-up${dir === "asc" ? " is-on" : ""}`}
          viewBox="0 0 8 4"
          aria-hidden="true"
        >
          <path
            d="M1.25 3.25 4 0.75 6.75 3.25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
      {showDown ? (
        <svg
          className={`plat-pair-table__arrange-down${dir === "desc" ? " is-on" : ""}`}
          viewBox="0 0 8 4"
          aria-hidden="true"
        >
          <path
            d="M1.25 0.75 4 3.25 6.75 0.75"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      className={`plat-orders__sort${active ? " is-active" : ""}`}
      onClick={() => onSort(sortKey)}
    >
      <span>{label}</span>
      <ArrangeIcon dir={active ? dir : null} />
    </button>
  );
}

function PeriodMenu({
  value,
  options,
  onChange,
}: {
  value: PeriodFilter;
  options: { id: PeriodFilter; label: string }[];
  onChange: (next: PeriodFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((opt) => opt.id === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className={`plat-period-menu${open ? " is-open" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="plat-period-menu__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter by created period"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{selected}</span>
      </button>
      {open ? (
        <ul className="plat-period-menu__list" role="listbox" aria-label="Created period">
          {options.map((opt) => {
            const on = opt.id === value;
            return (
              <li key={opt.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`plat-period-menu__option${on ? " is-on" : ""}`}
                  onClick={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

type OrdersListEmptyVariant = "no-orders" | "no-results" | "no-filter";

function statusFilterLabel(filter: StatusFilter): string {
  return STATUS_PILLS.find((pill) => pill.id === filter)?.label.toLowerCase() ?? filter;
}

function periodFilterLabel(filter: PeriodFilter): string {
  return PERIOD_OPTIONS.find((opt) => opt.id === filter)?.label.toLowerCase() ?? filter;
}

function OrdersListEmptyPanel({
  variant,
  query,
  statusFilter,
  periodFilter,
  cashierOnly,
  onClearSearch,
  onClearFilters,
}: {
  variant: OrdersListEmptyVariant;
  query?: string;
  statusFilter: StatusFilter;
  periodFilter: PeriodFilter;
  cashierOnly: boolean;
  onClearSearch?: () => void;
  onClearFilters?: () => void;
}) {
  const statusActive = statusFilter !== "all";
  const periodActive = periodFilter !== "all";

  const title =
    variant === "no-orders"
      ? "No payment orders yet"
      : variant === "no-results"
        ? "No matching orders"
        : statusActive && !periodActive
          ? `No ${statusFilterLabel(statusFilter)} orders`
          : !statusActive && periodActive
            ? "No orders in this period"
            : "No orders match these filters";

  const copy =
    variant === "no-orders"
      ? cashierOnly
        ? "Create a payment order to display a QR code at the terminal."
        : "Create a payment order to generate a QR and track payment on-chain."
      : variant === "no-results"
        ? query
          ? `Nothing matched “${query}”. Try order number, reference, address, or amount.`
          : "Try a different search term or clear filters to see more orders."
        : statusActive && periodActive
          ? `No ${statusFilterLabel(statusFilter)} orders in ${periodFilterLabel(periodFilter)}. Adjust the status or time range above.`
          : statusActive
            ? `There are no ${statusFilterLabel(statusFilter)} orders right now. Switch to All or pick another status.`
            : "No orders fall in this time range. Try All time or a wider period.";

  return (
    <div className="org-agents__list-empty b3-empty plat-orders__empty" role="status">
      <div className="b3-empty__mark" aria-hidden>
        {variant === "no-results" ? (
          <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
            <circle cx="20" cy="20" r="9" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M27 27 36 36"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M16 20h8M20 16v8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity="0.45"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
            <rect
              x="12"
              y="10"
              width="24"
              height="28"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M18 18h12M18 24h8M18 30h10"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity="0.55"
            />
            <path
              d="M30 8v6h6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <p className="b3-empty__title">{title}</p>
      <p className="b3-empty__copy">{copy}</p>
      <ul className="b3-empty__hints">
        {variant === "no-results" ? (
          <>
            <li>Search by order number, reference, amount, or wallet address</li>
            <li>Filter by status or time range in the top bar</li>
          </>
        ) : variant === "no-filter" ? (
          <>
            <li>Status pills show pending, verifying, completed, and more</li>
            <li>Use All time or widen the period to see older orders</li>
          </>
        ) : (
          <>
            <li>Orders appear here once created and shared with payers</li>
            <li>Track status from pending through on-chain confirmation</li>
          </>
        )}
      </ul>
      <div className="org-agents__list-empty-actions">
        {variant === "no-results" && onClearSearch ? (
          <button type="button" className="btn-ghost btn-inline" onClick={onClearSearch}>
            Clear search
          </button>
        ) : null}
        {variant === "no-filter" && onClearFilters ? (
          <button type="button" className="btn-ghost btn-inline" onClick={onClearFilters}>
            Show all orders
          </button>
        ) : null}
        {variant === "no-orders" ? (
          <Link className="btn-primary btn-inline" to={merchantRoute("orders/new")}>
            {cashierOnly ? "Create order" : "Create payment order"}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function OrdersListPage({ session }: Props) {
  const navigate = useNavigate();
  const canExport = useMemo(() => sessionCanExportOrders(session), [session]);
  const cashierOnly = useMemo(() => sessionIsCashierOnly(session), [session]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PaymentOrder[]>(
    () => peekMerchantOrders() ?? [],
  );
  const [loading, setLoading] = useState(() => peekMerchantOrders() == null);
  const [hasLoaded, setHasLoaded] = useState(
    () => peekMerchantOrders() != null,
  );
  const [error, setError] = useState<string | null>(null);
  const [topbarCenterSlot, setTopbarCenterSlot] = useState<HTMLElement | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTopbarCenterSlot(document.getElementById("merchant-topbar-center"));
    setTopbarActionsSlot(document.getElementById("merchant-topbar-actions"));
  }, []);

  const dismissToast = useCallback(() => setError(null), []);

  const load = useCallback(async () => {
    if (!hasLoaded) setLoading(true);
    setError(null);
    try {
      const rows = await getMerchantOrders();
      setItems(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load orders");
      setItems([]);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [hasLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "createdAt" || key === "expiresAt" ? "desc" : "asc");
  }

  const filtered = useMemo(() => {
    return items.filter((o) => {
      if (!matchesStatusFilter(o, statusFilter)) return false;
      if (!inPeriod(o.createdAt ?? o.expiresAt, periodFilter)) return false;
      return matchesOrderQuery(o, query);
    });
  }, [items, query, statusFilter, periodFilter]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => compareOrders(a, b, sortKey, sortDir));
    return rows;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, periodFilter, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, page]);

  const anomalyCount = useMemo(
    () => items.filter((o) => o.status === "payment_anomaly").length,
    [items],
  );

  function onExport() {
    window.open(
      ordersCsvUrl(
        statusFilter === "anomalies" ? { status: "payment_anomaly" } : undefined,
      ),
      "_blank",
    );
  }

  const topbarFilters = topbarCenterSlot
    ? createPortal(
        <div className="plat-orders-topbar" aria-label="Order filters">
          <div
            className="org-agents__pills plat-orders-topbar__pills"
            role="group"
            aria-label="Status filter"
          >
            {STATUS_PILLS.map((pill) => {
              let label = pill.label;
              if (pill.id === "anomalies" && anomalyCount > 0) {
                label = `Anomalies (${anomalyCount})`;
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
          <label className="org-agents__search-wrap plat-bills__search-wrap plat-orders-topbar__search">
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
              placeholder="Search orders by any column"
              aria-label="Search payment orders by any column"
            />
          </label>
          <div className="plat-orders-topbar__period">
            <PeriodMenu
              value={periodFilter}
              options={PERIOD_OPTIONS}
              onChange={setPeriodFilter}
            />
          </div>
        </div>,
        topbarCenterSlot,
      )
    : null;

  return (
    <div className="plat-bills plat-orders">
      {topbarFilters}
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />

      {topbarActionsSlot
        ? createPortal(
            <div className="org-agents__actions plat-orders-topbar__actions" aria-label="Order actions">
              {canExport ? (
                <button type="button" className="btn-ghost" onClick={onExport}>
                  Export CSV
                </button>
              ) : null}
              <Link className="btn-primary btn-inline" to={merchantRoute("orders/new")}>
                + {cashierOnly ? "Create Order" : "Create Payment Order"}
              </Link>
            </div>,
            topbarActionsSlot,
          )
        : null}

      <div className="plat-bills__table-wrap">
        {loading && !hasLoaded ? (
          <div className="plat-bills__pending">
            <PlatformPending
              compact
              title="Loading payment orders"
              copy="Fetching open and recent orders for your merchant account."
            />
            <PlatformTableSkeleton columns={9} rows={6} />
          </div>
        ) : null}

        {!loading && sorted.length === 0 ? (
          <OrdersListEmptyPanel
            variant={
              query.trim()
                ? "no-results"
                : statusFilter !== "all" || periodFilter !== "all"
                  ? "no-filter"
                  : "no-orders"
            }
            query={query}
            statusFilter={statusFilter}
            periodFilter={periodFilter}
            cashierOnly={cashierOnly}
            onClearSearch={() => setQuery("")}
            onClearFilters={() => {
              setStatusFilter("all");
              setPeriodFilter("all");
            }}
          />
        ) : null}

        {!loading && sorted.length > 0 ? (
          <>
            <table className="plat-bills__table plat-orders__table">
              <thead>
                <tr>
                  <th>
                    <SortHeader
                      label="Order"
                      sortKey="orderNumber"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th>
                    <SortHeader
                      label="Reference"
                      sortKey="reference"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th>
                    <SortHeader
                      label="Expires"
                      sortKey="expiresAt"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th>
                    <SortHeader
                      label="Amount"
                      sortKey="amount"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th>
                    <SortHeader
                      label="Network"
                      sortKey="network"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th>Address</th>
                  <th>
                    <SortHeader
                      label="Mode"
                      sortKey="mode"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th>
                    <SortHeader
                      label="Created by"
                      sortKey="createdBy"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th>
                    <SortHeader
                      label="Status"
                      sortKey="status"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {paged.map((o, index) => {
                  const tone = orderStatusTone(o.status, o);
                  const anomaly = o.status === "payment_anomaly";
                  const href = merchantRoute(`orders/${o.id}`);
                  return (
                    <tr
                      key={o.id}
                      className={`plat-bills__row plat-orders__row plat-orders__row--tone-${tone}`}
                      style={{ animationDelay: `${Math.min(index, 24) * 40}ms` }}
                      tabIndex={0}
                      role="link"
                      aria-label={`Open order ${o.orderNumber}`}
                      onMouseEnter={() => {
                        void getMerchantOrder(o.id);
                        void getMerchantOrderPayment(o.id);
                      }}
                      onFocus={() => {
                        void getMerchantOrder(o.id);
                        void getMerchantOrderPayment(o.id);
                      }}
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
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="plat-orders__ref" title={o.merchantReference ?? undefined}>
                        {o.merchantReference?.trim()
                          ? truncateRef(o.merchantReference)
                          : "—"}
                      </td>
                      <td className="plat-bills__due">exp {formatShortTime(o.expiresAt)}</td>
                      <td className="plat-bills__amount">
                        <FundAmount>{o.payableAmount.amount}</FundAmount>
                        <span className="plat-bills__currency muted">{o.asset}</span>
                      </td>
                      <td>
                        <span className="plat-orders__network">
                          {displayNetworkForPair(o.asset, o.network)}
                        </span>
                      </td>
                      <td>
                        <span className="plat-orders__address">
                          <NetworkIcon network={o.network} />
                          <span className="mono">{truncateAddress(o.receiveAddress)}</span>
                        </span>
                      </td>
                      <td className="plat-orders__mode muted">
                        {matchingModeLabel(o.matchingMode)}
                      </td>
                      <td
                        className="plat-orders__created-by"
                        title={o.createdByEmail?.trim() || undefined}
                      >
                        {createdByDisplay(o)}
                      </td>
                      <td>
                        <span
                          className={`plat-bills__badge tone-${tone}${anomaly ? " is-pulse" : ""}`}
                        >
                          {orderStatusLabel(o.status, o)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <OrgListPagination
              page={page}
              pageCount={pageCount}
              total={sorted.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
