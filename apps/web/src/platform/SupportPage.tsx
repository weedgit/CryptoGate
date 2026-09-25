import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  listOrders,
  type OrgAccount,
  type PaymentOrder,
} from "./api";
import { getPlatformOrgs, peekPlatformOrgs } from "./platformOrgList";
import { peekPlatformOrders } from "./platformOrdersList";
import { FundAmount } from "./FundAmount";
import { matchingModeLabel } from "../merchant/matchingLabels";
import { orderStatusLabel, orderStatusTone } from "../merchant/orderStatus";
import { PagePending } from "./ui/PlatformPending";
import { OrgListPagination } from "./OrgListPagination";
import { platformRoute } from "../shared/portalRouting";
import { getMerchantOrder } from "../merchant/merchantOrderDetail";
import { getMerchantOrderPayment } from "../merchant/merchantOrderPaymentDetails";
import {
  SortHeader,
  compareDate,
  compareNumber,
  compareText,
  toggleSortState,
  type SortState,
} from "./ui/TableArrange";

const INVOICE_LIST_LIMIT = 200;
const PAGE_SIZE = 15;

type SortKey =
  | "order"
  | "merchant"
  | "cashier"
  | "amount"
  | "status"
  | "mode"
  | "network"
  | "orgStatus"
  | "hint"
  | "when";

type StatusFilter =
  | ""
  | "payment_anomaly"
  | "pending_payment"
  | "verifying"
  | "completed"
  | "closed";

type AnomalyKind =
  | "underpay"
  | "overpay"
  | "collision"
  | "wrong_network"
  | "other";

type KindFilter = "" | AnomalyKind;

const STATUS_META: {
  id: StatusFilter;
  label: string;
  copy: string;
  tone: string;
}[] = [
  {
    id: "",
    label: "All",
    copy: `Latest ${INVOICE_LIST_LIMIT} loaded`,
    tone: "all",
  },
  {
    id: "payment_anomaly",
    label: "Anomaly",
    copy: "Needs merchant reconcile",
    tone: "underpay",
  },
  {
    id: "pending_payment",
    label: "Pending",
    copy: "Awaiting guest payment",
    tone: "overpay",
  },
  {
    id: "verifying",
    label: "Verifying",
    copy: "Confirmations in flight",
    tone: "network",
  },
  {
    id: "completed",
    label: "Completed",
    copy: "Settled payment invoices",
    tone: "all",
  },
  {
    id: "closed",
    label: "Closed",
    copy: "Expired, failed, or cancelled",
    tone: "other",
  },
];

const KIND_META: {
  id: KindFilter;
  label: string;
  copy: string;
  tone: string;
}[] = [
  {
    id: "",
    label: "Open",
    copy: "All anomaly kinds",
    tone: "all",
  },
  {
    id: "underpay",
    label: "Underpay",
    copy: "Received less than expected",
    tone: "underpay",
  },
  {
    id: "overpay",
    label: "Overpay",
    copy: "Received more than expected",
    tone: "overpay",
  },
  {
    id: "collision",
    label: "Collision",
    copy: "Same-amount clash",
    tone: "collision",
  },
  {
    id: "wrong_network",
    label: "Wrong network",
    copy: "Asset or chain mismatch",
    tone: "network",
  },
  {
    id: "other",
    label: "Other",
    copy: "Late, duplicate, or unclear",
    tone: "other",
  },
];

const CLOSED_STATUSES = new Set(["expired", "failed", "cancelled"]);

/** Prefer stored reason; fall back to amount/mode heuristics for older rows. */
function classifyAnomalyKind(order: PaymentOrder): AnomalyKind {
  const reason = (order.anomalyReason ?? "").trim().toLowerCase();
  if (
    reason === "mode_b_underpay" ||
    reason === "underpay" ||
    reason.includes("underpay")
  ) {
    return "underpay";
  }
  if (
    reason === "mode_b_overpay" ||
    reason === "overpay" ||
    reason.includes("overpay")
  ) {
    return "overpay";
  }
  if (reason.includes("collision") || reason === "no_exact_amount_match") {
    return "collision";
  }
  if (reason.includes("wrong_network") || reason.includes("wrong_asset")) {
    return "wrong_network";
  }
  if (
    reason === "late_payment_after_expiry" ||
    reason === "duplicate_payment" ||
    reason === "delayed_arrival"
  ) {
    return "other";
  }

  const payable = Number(order.payableAmount?.amount);
  const receivedRaw = order.receivedAmount?.amount;
  const received =
    receivedRaw != null && receivedRaw !== "" ? Number(receivedRaw) : null;
  if (received != null && Number.isFinite(received) && Number.isFinite(payable)) {
    if (received < payable) return "underpay";
    if (received > payable) return "overpay";
    if ((order.matchingMode || "B") === "B") return "collision";
  }
  if (
    (order.matchingMode || "B") === "D" &&
    (received == null || !Number.isFinite(received))
  ) {
    return "other";
  }
  return "other";
}

function inferAnomalyHint(order: PaymentOrder): string {
  if (order.status !== "payment_anomaly") return "—";
  const kind = classifyAnomalyKind(order);
  const payable = order.payableAmount?.amount;
  const receivedRaw = order.receivedAmount?.amount;
  switch (kind) {
    case "underpay":
      return `Underpay — expected ${payable}, received ${receivedRaw ?? "—"}.`;
    case "overpay":
      return `Overpay — expected ${payable}, received ${receivedRaw ?? "—"}.`;
    case "collision":
      return "Likely same-amount collision — never FIFO-guess; reconcile manually.";
    case "wrong_network":
      return "Wrong network or asset suspected — check explorer, then merchant resolves.";
    default:
      return "Needs manual review — reconcile from order detail; never mark paid here.";
  }
}

function formatWhen(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function matchesStatusFilter(order: PaymentOrder, filter: StatusFilter): boolean {
  if (!filter) return true;
  if (filter === "closed") return CLOSED_STATUSES.has(order.status);
  return order.status === filter;
}

function merchantIdForOrg(
  org: OrgAccount | undefined,
  byId: Map<string, OrgAccount>,
): string | null {
  if (!org) return null;
  if (org.type === "merchant") return org.id;
  if (org.type === "merchant_site" && org.parentId) {
    const parent = byId.get(org.parentId);
    if (parent?.type === "merchant") return parent.id;
    return org.parentId;
  }
  return null;
}

function mergeOrders(pages: PaymentOrder[][]): PaymentOrder[] {
  const seen = new Set<string>();
  const out: PaymentOrder[] = [];
  for (const page of pages) {
    for (const row of page) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  out.sort((a, b) => compareDate(b.createdAt, a.createdAt));
  return out.slice(0, INVOICE_LIST_LIMIT);
}

async function fetchSupportOrders(opts: {
  statusFilter: StatusFilter;
  siteId: string;
  merchantId: string;
  siteIdsUnderMerchant: string[];
}): Promise<PaymentOrder[]> {
  const statusArg =
    opts.statusFilter && opts.statusFilter !== "closed"
      ? opts.statusFilter
      : undefined;

  if (opts.siteId) {
    const items = await listOrders({
      orgId: opts.siteId,
      status: statusArg,
      limit: INVOICE_LIST_LIMIT,
    });
    return opts.statusFilter === "closed"
      ? items.filter((o) => CLOSED_STATUSES.has(o.status))
      : items;
  }

  if (opts.merchantId) {
    const orgIds = [opts.merchantId, ...opts.siteIdsUnderMerchant];
    const pages = await Promise.all(
      orgIds.map((orgId) =>
        listOrders({
          orgId,
          status: statusArg,
          limit: INVOICE_LIST_LIMIT,
        }),
      ),
    );
    const merged = mergeOrders(pages);
    return opts.statusFilter === "closed"
      ? merged.filter((o) => CLOSED_STATUSES.has(o.status))
      : merged;
  }

  if (opts.statusFilter === "closed") {
    const pages = await Promise.all(
      [...CLOSED_STATUSES].map((status) =>
        listOrders({ status, limit: INVOICE_LIST_LIMIT }),
      ),
    );
    return mergeOrders(pages);
  }

  return listOrders({
    status: statusArg,
    limit: INVOICE_LIST_LIMIT,
  });
}

/** Platform Support — payment invoices by merchant/site with compliance status. */
export function SupportPage() {
  const [orders, setOrders] = useState<PaymentOrder[]>(
    () => peekPlatformOrders() ?? [],
  );
  const [orgs, setOrgs] = useState<OrgAccount[]>(() => peekPlatformOrgs() ?? []);
  const [query, setQuery] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [modeFilter, setModeFilter] = useState<"" | "B" | "C" | "D" | "S">("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("");
  const [sort, setSort] = useState<SortState<SortKey>>({
    key: "when",
    dir: "desc",
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(
    () => peekPlatformOrders() == null && peekPlatformOrgs() == null,
  );
  const [hasLoaded, setHasLoaded] = useState(
    () => peekPlatformOrders() != null || peekPlatformOrgs() != null,
  );
  const hasLoadedRef = useRef(hasLoaded);
  hasLoadedRef.current = hasLoaded;
  const [error, setError] = useState<string | null>(null);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] = useState<HTMLElement | null>(
    null,
  );

  const dismissToast = useCallback(() => setError(null), []);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("platform-topbar-center"));
    setTopbarActionsSlot(document.getElementById("platform-topbar-actions"));
  }, []);

  const orgById = useMemo(() => {
    const map = new Map<string, OrgAccount>();
    for (const o of orgs) map.set(o.id, o);
    return map;
  }, [orgs]);

  const merchants = useMemo(
    () =>
      orgs
        .filter((o) => o.type === "merchant")
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [orgs],
  );

  const sitesForSelect = useMemo(() => {
    const sites = orgs.filter((o) => o.type === "merchant_site");
    const scoped = merchantFilter
      ? sites.filter((s) => s.parentId === merchantFilter)
      : sites;
    return scoped.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [orgs, merchantFilter]);

  const load = useCallback(async () => {
    if (!hasLoadedRef.current && peekPlatformOrders() == null) setLoading(true);
    setError(null);
    try {
      const orgList = await getPlatformOrgs();
      setOrgs(orgList);
      const siteIds = merchantFilter
        ? orgList
            .filter(
              (o) =>
                o.type === "merchant_site" && o.parentId === merchantFilter,
            )
            .map((o) => o.id)
        : [];
      const invoiceOrders = await fetchSupportOrders({
        statusFilter,
        siteId: siteFilter,
        merchantId: merchantFilter,
        siteIdsUnderMerchant: siteIds,
      });
      setOrders(invoiceOrders);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === "rate_limited"
            ? "Too many requests — wait a moment and retry."
            : err.message
          : "Failed to load support invoices",
      );
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [merchantFilter, siteFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (siteFilter && !sitesForSelect.some((s) => s.id === siteFilter)) {
      setSiteFilter("");
    }
  }, [siteFilter, sitesForSelect]);

  function resolveRowOrgs(order: PaymentOrder): {
    rowOrg: OrgAccount | undefined;
    merchantOrg: OrgAccount | undefined;
    merchantId: string | null;
    isSite: boolean;
    displayName: string;
    siteName: string | null;
  } {
    const rowOrg = order.orgId ? orgById.get(order.orgId) : undefined;
    const isSite = rowOrg?.type === "merchant_site";
    const merchantId = merchantIdForOrg(rowOrg, orgById);
    const merchantOrg = merchantId ? orgById.get(merchantId) : undefined;
    const siteName = isSite ? rowOrg?.name ?? null : null;
    const displayName =
      merchantOrg?.name ??
      rowOrg?.name ??
      order.orgName ??
      (order.orgId ? order.orgId.slice(0, 8) : "—");
    return { rowOrg, merchantOrg, merchantId, isSite, displayName, siteName };
  }

  /** Prefer billing merchant org for pause/suspend (sites inherit parent). */
  function statusOrgForRow(order: PaymentOrder): OrgAccount | undefined {
    const { rowOrg, merchantOrg } = resolveRowOrgs(order);
    return merchantOrg ?? rowOrg;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = orders
      .filter((o) => matchesStatusFilter(o, statusFilter))
      .filter((o) => (modeFilter ? o.matchingMode === modeFilter : true))
      .filter((o) => {
        if (statusFilter !== "payment_anomaly" || !kindFilter) return true;
        return classifyAnomalyKind(o) === kindFilter;
      })
      .filter((o) => {
        if (!q) return true;
        const { displayName, siteName } = resolveRowOrgs(o);
        const cashier = (o.createdByEmail ?? o.createdBy ?? "").toLowerCase();
        return (
          o.orderNumber.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          displayName.toLowerCase().includes(q) ||
          (siteName ?? "").toLowerCase().includes(q) ||
          cashier.includes(q) ||
          o.receiveAddress.toLowerCase().includes(q) ||
          `${o.asset} ${o.network}`.toLowerCase().includes(q)
        );
      });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      let cmp = 0;
      const aMeta = resolveRowOrgs(a);
      const bMeta = resolveRowOrgs(b);
      const aStatusOrg = statusOrgForRow(a);
      const bStatusOrg = statusOrgForRow(b);
      switch (sort.key) {
        case "order":
          cmp = compareText(a.orderNumber, b.orderNumber);
          break;
        case "merchant":
          cmp = compareText(
            `${aMeta.displayName} ${aMeta.siteName ?? ""}`,
            `${bMeta.displayName} ${bMeta.siteName ?? ""}`,
          );
          break;
        case "cashier":
          cmp = compareText(
            a.createdByEmail ?? a.createdBy ?? "",
            b.createdByEmail ?? b.createdBy ?? "",
          );
          break;
        case "amount":
          cmp = compareNumber(
            Number(a.payableAmount?.amount),
            Number(b.payableAmount?.amount),
          );
          break;
        case "status":
          cmp = compareText(a.status, b.status);
          break;
        case "mode":
          cmp = compareText(a.matchingMode || "B", b.matchingMode || "B");
          break;
        case "network":
          cmp = compareText(
            `${a.asset} ${a.network}`,
            `${b.asset} ${b.network}`,
          );
          break;
        case "orgStatus":
          cmp = compareText(
            `${aStatusOrg?.status ?? ""} ${aStatusOrg?.orderCreateSuspended ? "1" : "0"}`,
            `${bStatusOrg?.status ?? ""} ${bStatusOrg?.orderCreateSuspended ? "1" : "0"}`,
          );
          break;
        case "hint":
          cmp = compareText(inferAnomalyHint(a), inferAnomalyHint(b));
          break;
        case "when":
        default:
          cmp = compareDate(a.createdAt, b.createdAt);
          break;
      }
      if (cmp !== 0) return dir * cmp;
      return dir * compareDate(a.createdAt, b.createdAt);
    });
    // resolveRowOrgs closes over orgById
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    orders,
    orgById,
    query,
    statusFilter,
    modeFilter,
    kindFilter,
    sort,
  ]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    setPage(1);
  }, [query, merchantFilter, siteFilter, statusFilter, modeFilter, kindFilter, sort]);

  const onSort = useCallback((key: SortKey) => {
    setSort((prev) =>
      toggleSortState(
        prev,
        key,
        key === "when" || key === "amount" ? "desc" : "asc",
      ),
    );
  }, []);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const modeCounts = useMemo(() => {
    const counts = { B: 0, C: 0, D: 0, S: 0 };
    for (const o of orders) {
      if (!matchesStatusFilter(o, statusFilter)) continue;
      const m = o.matchingMode as keyof typeof counts;
      if (m in counts) counts[m] += 1;
    }
    return counts;
  }, [orders, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<Exclude<StatusFilter, "">, number> = {
      payment_anomaly: 0,
      pending_payment: 0,
      verifying: 0,
      completed: 0,
      closed: 0,
    };
    for (const o of orders) {
      if (o.status === "payment_anomaly") counts.payment_anomaly += 1;
      else if (o.status === "pending_payment") counts.pending_payment += 1;
      else if (o.status === "verifying") counts.verifying += 1;
      else if (o.status === "completed") counts.completed += 1;
      else if (CLOSED_STATUSES.has(o.status)) counts.closed += 1;
    }
    return counts;
  }, [orders]);

  const kindCounts = useMemo(() => {
    const counts: Record<AnomalyKind, number> = {
      underpay: 0,
      overpay: 0,
      collision: 0,
      wrong_network: 0,
      other: 0,
    };
    for (const o of orders) {
      if (o.status !== "payment_anomaly") continue;
      counts[classifyAnomalyKind(o)] += 1;
    }
    return counts;
  }, [orders]);

  function statusCardValue(id: StatusFilter): number {
    if (id === "") return orders.length;
    return statusCounts[id];
  }

  function kindCardValue(id: KindFilter): number {
    if (id === "") {
      return orders.filter((o) => o.status === "payment_anomaly").length;
    }
    return kindCounts[id];
  }

  const showAnomalyBanner =
    statusFilter === "payment_anomaly" ||
    filtered.some((o) => o.status === "payment_anomaly");

  return (
    <div className="plat-support">
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />

      {topbarSlot
        ? createPortal(
            <label className="org-agents__search-wrap plat-support__search-wrap">
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
                placeholder="Search order, merchant, site, cashier, or address"
                aria-label="Search payment invoices"
              />
            </label>,
            topbarSlot,
          )
        : null}

      {topbarActionsSlot
        ? createPortal(
            <div className="plat-support__topbar-actions">
              <button
                type="button"
                className="plat-support__refresh"
                onClick={() => void load()}
                disabled={loading}
              >
                Refresh
              </button>
            </div>,
            topbarActionsSlot,
          )
        : null}

      {showAnomalyBanner ? (
        <div className="plat-support__banner" role="note">
          <span className="plat-support__banner-label">Watch-only</span>
          <p>
            Anomaly invoices are review-only here. Platform cannot mark paid —
            the merchant or cashier reconciles and resolves the anomaly.
          </p>
        </div>
      ) : null}

      <div className="plat-support__toolbar">
        <label className="plat-support__field">
          <span>Merchant</span>
          <select
            className="plat-support__select"
            value={merchantFilter}
            onChange={(e) => {
              setMerchantFilter(e.target.value);
              setSiteFilter("");
            }}
            aria-label="Filter by merchant"
          >
            <option value="">All merchants</option>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="plat-support__field">
          <span>Site</span>
          <select
            className="plat-support__select"
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            aria-label="Filter by site"
          >
            <option value="">All sites</option>
            {sitesForSelect.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div
          className="plat-support__pills"
          role="group"
          aria-label="Matching mode filter"
        >
          {(
            [
              { id: "" as const, label: "All" },
              { id: "B" as const, label: `B · ${modeCounts.B}` },
              { id: "C" as const, label: `C · ${modeCounts.C}` },
              { id: "D" as const, label: `D · ${modeCounts.D}` },
              { id: "S" as const, label: `S · ${modeCounts.S}` },
            ] as const
          ).map((pill) => (
            <button
              key={pill.id || "all"}
              type="button"
              className={`plat-support__pill${
                modeFilter === pill.id ? " is-active" : ""
              }`}
              onClick={() => setModeFilter(pill.id)}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="plat-support__kpis"
        role="group"
        aria-label="Invoice status filter"
      >
        {STATUS_META.map((card) => {
          const active = statusFilter === card.id;
          return (
            <button
              key={card.id || "all"}
              type="button"
              className={`plat-support__kpi tone-${card.tone}${
                active ? " is-active" : ""
              }`}
              onClick={() => {
                setStatusFilter(card.id);
                if (card.id !== "payment_anomaly") setKindFilter("");
              }}
              aria-pressed={active}
            >
              <p className="plat-support__kpi-label">{card.label}</p>
              <p className="plat-support__kpi-value">
                {loading ? "…" : statusCardValue(card.id).toLocaleString()}
              </p>
              <p className="plat-support__kpi-copy">{card.copy}</p>
            </button>
          );
        })}
      </div>

      {statusFilter === "payment_anomaly" ? (
        <div
          className="plat-support__kpis plat-support__kpis--kinds"
          role="group"
          aria-label="Anomaly kind filter"
        >
          {KIND_META.map((card) => {
            const active = kindFilter === card.id;
            return (
              <button
                key={card.id || "all-kinds"}
                type="button"
                className={`plat-support__kpi tone-${card.tone}${
                  active ? " is-active" : ""
                }`}
                onClick={() => setKindFilter(card.id)}
                aria-pressed={active}
              >
                <p className="plat-support__kpi-label">{card.label}</p>
                <p className="plat-support__kpi-value">
                  {loading ? "…" : kindCardValue(card.id).toLocaleString()}
                </p>
                <p className="plat-support__kpi-copy">{card.copy}</p>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="plat-support__table-wrap">
        {loading && !hasLoaded ? <PagePending /> : null}

        {!loading && filtered.length === 0 ? (
          <div className="plat-support__empty" role="status">
            <p className="plat-support__empty-title">
              {orders.length === 0
                ? "No payment invoices loaded"
                : "No matches for this filter"}
            </p>
            <p className="plat-support__empty-copy">
              {orders.length === 0
                ? "Payment invoices appear here as merchants and sites create orders. Use merchant / site filters to focus support."
                : "Clear search or filters to see more rows."}
            </p>
          </div>
        ) : null}

        {!loading && filtered.length > 0 ? (
          <table className="plat-support__table">
            <colgroup>
              <col className="plat-support__col-order" />
              <col className="plat-support__col-merchant" />
              <col className="plat-support__col-cashier" />
              <col className="plat-support__col-amount" />
              <col className="plat-support__col-status" />
              <col className="plat-support__col-mode" />
              <col className="plat-support__col-network" />
              <col className="plat-support__col-org-status" />
              <col className="plat-support__col-hint" />
              <col className="plat-support__col-when" />
            </colgroup>
            <thead>
              <tr>
                <th>
                  <SortHeader
                    label="Order"
                    sortKey="order"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Merchant / Site"
                    sortKey="merchant"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Cashier"
                    sortKey="cashier"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Amount"
                    sortKey="amount"
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
                    label="Mode"
                    sortKey="mode"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Network"
                    sortKey="network"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Org status"
                    sortKey="orgStatus"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Hint"
                    sortKey="hint"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="When"
                    sortKey="when"
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.map((order) => {
                const {
                  merchantOrg,
                  merchantId,
                  isSite,
                  displayName,
                  siteName,
                } = resolveRowOrgs(order);
                const statusOrg = statusOrgForRow(order);
                const hint = inferAnomalyHint(order);
                const cashierLabel =
                  order.createdByEmail?.trim() ||
                  (order.createdBy ? order.createdBy.slice(0, 8) : "—");
                const orderTitle = [
                  order.id,
                  order.receiveAddress
                    ? `addr ${order.receiveAddress}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                const amountTitle = order.receivedAmount?.amount
                  ? `payable ${order.payableAmount.amount} · received ${order.receivedAmount.amount}`
                  : undefined;
                const paused = statusOrg?.status === "paused";
                const suspended = statusOrg?.orderCreateSuspended === true;
                const orgStatusNeedsAttention = paused || suspended;
                const merchantHref = merchantId
                  ? platformRoute(`accounts/merchants/${merchantId}`)
                  : null;
                const complianceHref = merchantHref
                  ? `${merchantHref}?tab=compliance`
                  : null;
                const cashiersHref = merchantHref
                  ? `${merchantHref}?tab=cashiers`
                  : null;
                const billHref = statusOrg?.statusReasonBillId
                  ? platformRoute(
                      `service-bills/${encodeURIComponent(statusOrg.statusReasonBillId)}`,
                    )
                  : null;

                return (
                  <tr key={order.id}>
                    <td>
                      <Link
                        className="plat-support__order"
                        to={platformRoute(
                          `orders/${encodeURIComponent(order.id)}`,
                        )}
                        title={orderTitle}
                        onMouseEnter={() => {
                          void getMerchantOrder(order.id);
                          void getMerchantOrderPayment(order.id);
                        }}
                        onFocus={() => {
                          void getMerchantOrder(order.id);
                          void getMerchantOrderPayment(order.id);
                        }}
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td>
                      {merchantHref ? (
                        <Link
                          className="plat-support__merchant"
                          to={merchantHref}
                          title={
                            siteName
                              ? `${displayName} · site ${siteName}`
                              : `Open ${displayName}`
                          }
                        >
                          {displayName}
                          {siteName ? (
                            <span className="plat-support__site">
                              {" "}
                              · {siteName}
                            </span>
                          ) : isSite ? (
                            <span className="plat-support__site"> · site</span>
                          ) : null}
                        </Link>
                      ) : (
                        <span
                          className="plat-support__merchant"
                          title={displayName}
                        >
                          {displayName}
                        </span>
                      )}
                    </td>
                    <td>
                      {cashiersHref && cashierLabel !== "—" ? (
                        <Link
                          className="plat-support__cashier"
                          to={cashiersHref}
                          title="Open merchant cashiers"
                        >
                          {cashierLabel}
                        </Link>
                      ) : (
                        <span className="plat-support__cashier">
                          {cashierLabel}
                        </span>
                      )}
                    </td>
                    <td className="plat-support__amount" title={amountTitle}>
                      <FundAmount amount={order.payableAmount.amount} />
                      {order.receivedAmount?.amount ? (
                        <span className="plat-support__recv">
                          / {order.receivedAmount.amount}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`plat-support__status tone-${orderStatusTone(order.status, order)}`}
                      >
                        {orderStatusLabel(order.status, order)}
                      </span>
                    </td>
                    <td>
                      <span
                        className="plat-support__mode"
                        title={matchingModeLabel(order.matchingMode)}
                      >
                        Mode {order.matchingMode || "B"}
                      </span>
                    </td>
                    <td
                      className="plat-support__net"
                      title={`${order.asset} · ${order.network}`}
                    >
                      {order.asset}
                      <span> · {order.network}</span>
                    </td>
                    <td className="plat-support__org-status">
                      {statusOrg ? (
                        <>
                          {orgStatusNeedsAttention && complianceHref ? (
                            <Link
                              className={`plat-support__org-badge${
                                paused ? " is-paused" : " is-active"
                              }`}
                              to={complianceHref}
                              title={
                                statusOrg.statusReason ??
                                (suspended
                                  ? "Order create suspended — open compliance"
                                  : "Open compliance")
                              }
                            >
                              {paused ? "Paused" : "Active"}
                            </Link>
                          ) : (
                            <span
                              className={`plat-support__org-badge${
                                paused ? " is-paused" : " is-active"
                              }`}
                            >
                              {paused ? "Paused" : "Active"}
                            </span>
                          )}
                          {suspended ? (
                            <span
                              className="plat-support__suspend-badge"
                              title="Payment order create suspended"
                            >
                              Suspended
                            </span>
                          ) : null}
                          {billHref ? (
                            <Link
                              className="plat-support__bill-link"
                              to={billHref}
                              title="Open related service bill"
                            >
                              Bill
                            </Link>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="plat-support__hint" title={hint}>
                      {hint}
                    </td>
                    <td className="plat-support__when">
                      {formatWhen(order.createdAt)}
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
    </div>
  );
}
