import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  getPlatformOrgs,
  listOrders,
  peekPlatformOrgs,
  type PaymentOrder,
} from "./api";
import { FundAmount } from "./FundAmount";
import { matchingModeLabel } from "../merchant/matchingLabels";
import { PlatformPending, PlatformTableSkeleton } from "./ui/PlatformPending";
import { OrgListPagination } from "./OrgListPagination";
import {
  SortHeader,
  compareDate,
  compareNumber,
  compareText,
  toggleSortState,
  type SortState,
} from "./ui/TableArrange";

const ANOMALY_LIST_LIMIT = 200;
const PAGE_SIZE = 15;

type SortKey =
  | "order"
  | "merchant"
  | "amount"
  | "mode"
  | "network"
  | "hint"
  | "when";

type AnomalyKind =
  | "underpay"
  | "overpay"
  | "collision"
  | "wrong_network"
  | "other";

type KindFilter = "" | AnomalyKind;

const KIND_META: {
  id: KindFilter;
  label: string;
  copy: string;
  tone: string;
}[] = [
  {
    id: "",
    label: "Open",
    copy: `Latest ${ANOMALY_LIST_LIMIT} loaded`,
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
  if (
    reason.includes("collision") ||
    reason === "no_exact_amount_match"
  ) {
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
  if ((order.matchingMode || "B") === "D" && (received == null || !Number.isFinite(received))) {
    return "wrong_network";
  }
  return "other";
}

function inferAnomalyHint(order: PaymentOrder): string {
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

/** Platform compliance — open payment anomalies queue (no Mark paid). */
export function CompliancePage() {
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [orgNames, setOrgNames] = useState<Map<string, string>>(() => {
    const cached = peekPlatformOrgs();
    return cached ? new Map(cached.map((o) => [o.id, o.name])) : new Map();
  });
  const [query, setQuery] = useState("");
  const [modeFilter, setModeFilter] = useState<"" | "B" | "C" | "D" | "S">("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("");
  const [sort, setSort] = useState<SortState<SortKey>>({
    key: "when",
    dir: "desc",
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [anomalyOrders, orgs] = await Promise.all([
        listOrders({ status: "payment_anomaly", limit: ANOMALY_LIST_LIMIT }),
        getPlatformOrgs(),
      ]);
      setOrders(anomalyOrders);
      setOrgNames(new Map(orgs.map((o) => [o.id, o.name])));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === "rate_limited"
            ? "Too many requests — wait a moment and retry."
            : err.message
          : "Failed to load compliance",
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
    const rows = orders
      .filter((o) => (modeFilter ? o.matchingMode === modeFilter : true))
      .filter((o) =>
        kindFilter ? classifyAnomalyKind(o) === kindFilter : true,
      )
      .filter((o) => {
        if (!q) return true;
        const merchant = (orgNames.get(o.orgId ?? "") ?? o.orgId ?? "").toLowerCase();
        return (
          o.orderNumber.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          merchant.includes(q) ||
          o.receiveAddress.toLowerCase().includes(q) ||
          `${o.asset} ${o.network}`.toLowerCase().includes(q)
        );
      });
    const dir = sort.dir === "asc" ? 1 : -1;
    const merchantOf = (o: PaymentOrder) =>
      orgNames.get(o.orgId ?? "") ?? o.orgId ?? "";
    return [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case "order":
          cmp = compareText(a.orderNumber, b.orderNumber);
          break;
        case "merchant":
          cmp = compareText(merchantOf(a), merchantOf(b));
          break;
        case "amount":
          cmp = compareNumber(
            Number(a.payableAmount?.amount),
            Number(b.payableAmount?.amount),
          );
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
  }, [orders, orgNames, query, modeFilter, kindFilter, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    setPage(1);
  }, [query, modeFilter, kindFilter, sort]);

  const onSort = useCallback((key: SortKey) => {
    setSort((prev) =>
      toggleSortState(prev, key, key === "when" || key === "amount" ? "desc" : "asc"),
    );
  }, []);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const modeCounts = useMemo(() => {
    const counts = { B: 0, C: 0, D: 0, S: 0 };
    for (const o of orders) {
      const m = o.matchingMode as keyof typeof counts;
      if (m in counts) counts[m] += 1;
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
      counts[classifyAnomalyKind(o)] += 1;
    }
    return counts;
  }, [orders]);

  function kindCardValue(id: KindFilter): number {
    if (id === "") return orders.length;
    return kindCounts[id];
  }

  return (
    <div className="plat-compliance">
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />

      {topbarSlot
        ? createPortal(
            <label className="org-agents__search-wrap plat-compliance__search-wrap">
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
                className="org-agents__search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search order, merchant, address"
                aria-label="Search payment anomalies"
              />
            </label>,
            topbarSlot,
          )
        : null}

      {topbarActionsSlot
        ? createPortal(
            <div className="plat-compliance__topbar-actions">
              <div
                className="plat-compliance__pills"
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
                    className={`plat-compliance__pill${
                      modeFilter === pill.id ? " is-active" : ""
                    }`}
                    onClick={() => setModeFilter(pill.id)}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn-ghost btn-inline"
                onClick={() => void load()}
                disabled={loading}
              >
                Refresh
              </button>
            </div>,
            topbarActionsSlot,
          )
        : null}

      <div className="plat-compliance__banner" role="note">
        <span className="plat-compliance__banner-label">Watch-only</span>
        <p>
          Click an order to review evidence. Platform cannot mark paid — the
          merchant reconciles and resolves the anomaly.
        </p>
      </div>

      <div
        className="plat-compliance__kpis"
        role="group"
        aria-label="Anomaly kind filter"
      >
        {KIND_META.map((card) => {
          const active = kindFilter === card.id;
          return (
            <button
              key={card.id || "all"}
              type="button"
              className={`plat-compliance__kpi tone-${card.tone}${
                active ? " is-active" : ""
              }`}
              onClick={() => setKindFilter(card.id)}
              aria-pressed={active}
            >
              <p className="plat-compliance__kpi-label">{card.label}</p>
              <p className="plat-compliance__kpi-value">
                {loading ? "…" : kindCardValue(card.id).toLocaleString()}
              </p>
              <p className="plat-compliance__kpi-copy">{card.copy}</p>
            </button>
          );
        })}
      </div>

      <div className="plat-compliance__table-wrap">
        {loading ? (
          <div className="plat-compliance__pending">
            <PlatformPending
              compact
              title="Loading payment anomalies"
              copy="Fetching open anomaly orders across platform scope."
            />
            <PlatformTableSkeleton columns={7} rows={8} />
          </div>
        ) : null}

        {!loading && filtered.length === 0 ? (
          <div className="plat-compliance__empty" role="status">
            <p className="plat-compliance__empty-title">
              {orders.length === 0
                ? "No open payment anomalies"
                : "No matches for this filter"}
            </p>
            <p className="plat-compliance__empty-copy">
              {orders.length === 0
                ? "When Mode B collisions, under/overpays, or wrong-network receipts land, they appear here."
                : "Clear search or kind / mode filter to see more rows."}
            </p>
          </div>
        ) : null}

        {!loading && filtered.length > 0 ? (
          <table className="plat-compliance__table">
            <colgroup>
              <col className="plat-compliance__col-order" />
              <col className="plat-compliance__col-merchant" />
              <col className="plat-compliance__col-amount" />
              <col className="plat-compliance__col-mode" />
              <col className="plat-compliance__col-network" />
              <col className="plat-compliance__col-hint" />
              <col className="plat-compliance__col-when" />
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
                    label="Merchant"
                    sortKey="merchant"
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
                const orgId = order.orgId ?? "";
                const merchantName =
                  orgNames.get(orgId) ?? (orgId ? orgId.slice(0, 8) : "—");
                const hint = inferAnomalyHint(order);
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
                return (
                  <tr key={order.id}>
                    <td>
                      <Link
                        className="plat-compliance__order"
                        to={`/platform/orders/${encodeURIComponent(order.id)}`}
                        title={orderTitle}
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td>
                      {orgId ? (
                        <Link
                          className="plat-compliance__merchant"
                          to={`/platform/merchants/${orgId}?tab=compliance`}
                          title={`Open ${merchantName}`}
                        >
                          {merchantName}
                        </Link>
                      ) : (
                        <span className="plat-compliance__merchant" title={merchantName}>
                          {merchantName}
                        </span>
                      )}
                    </td>
                    <td className="plat-compliance__amount" title={amountTitle}>
                      <FundAmount amount={order.payableAmount.amount} />
                      {order.receivedAmount?.amount ? (
                        <span className="plat-compliance__recv">
                          / {order.receivedAmount.amount}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className="plat-compliance__mode"
                        title={matchingModeLabel(order.matchingMode)}
                      >
                        Mode {order.matchingMode || "B"}
                      </span>
                    </td>
                    <td
                      className="plat-compliance__net"
                      title={`${order.asset} · ${order.network}`}
                    >
                      {order.asset}
                      <span> · {order.network}</span>
                    </td>
                    <td className="plat-compliance__hint" title={hint}>
                      {hint}
                    </td>
                    <td className="plat-compliance__when">
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
