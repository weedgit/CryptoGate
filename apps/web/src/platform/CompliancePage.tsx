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

const ANOMALY_LIST_LIMIT = 200;
const PAGE_SIZE = 10;

function inferAnomalyHint(order: PaymentOrder): string {
  const payable = Number(order.payableAmount?.amount);
  const receivedRaw = order.receivedAmount?.amount;
  const received =
    receivedRaw != null && receivedRaw !== "" ? Number(receivedRaw) : null;
  const mode = order.matchingMode || "B";

  if (received == null || !Number.isFinite(received)) {
    return "No clean on-chain match bound — reconcile from merchant order detail.";
  }
  if (Number.isFinite(payable) && received < payable) {
    return `Underpay — expected ${order.payableAmount.amount}, received ${receivedRaw}.`;
  }
  if (Number.isFinite(payable) && received > payable) {
    return `Overpay — expected ${order.payableAmount.amount}, received ${receivedRaw}.`;
  }
  if (mode === "B") {
    return "Likely Mode B same-amount collision — never FIFO-guess; reconcile manually.";
  }
  if (mode === "D") {
    return "Memo/tag mismatch or wrong-network receipt suspected.";
  }
  return "Amount or match mismatch — reconcile manually; no Mark paid from compliance.";
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
    return orders
      .filter((o) => (modeFilter ? o.matchingMode === modeFilter : true))
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
      })
      .sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta;
      });
  }, [orders, orgNames, query, modeFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    setPage(1);
  }, [query, modeFilter]);

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
          Open merchant detail for evidence. Never mark paid from compliance —
          anomalies stay unresolved until the merchant reconciles.
        </p>
      </div>

      <div className="plat-compliance__kpis">
        <div className="plat-compliance__kpi">
          <p className="plat-compliance__kpi-label">Open anomalies</p>
          <p className="plat-compliance__kpi-value">
            {loading ? "…" : orders.length.toLocaleString()}
          </p>
          <p className="plat-compliance__kpi-copy">
            Latest {ANOMALY_LIST_LIMIT} platform order fetch
          </p>
        </div>
        <div className="plat-compliance__kpi">
          <p className="plat-compliance__kpi-label">Visible now</p>
          <p className="plat-compliance__kpi-value">
            {loading ? "…" : filtered.length.toLocaleString()}
          </p>
          <p className="plat-compliance__kpi-copy">
            After search and mode filter
          </p>
        </div>
        <div className="plat-compliance__kpi">
          <p className="plat-compliance__kpi-label">Merchants touched</p>
          <p className="plat-compliance__kpi-value">
            {loading
              ? "…"
              : new Set(orders.map((o) => o.orgId).filter(Boolean)).size.toLocaleString()}
          </p>
          <p className="plat-compliance__kpi-copy">Distinct orgs in queue</p>
        </div>
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
                : "Clear search or switch matching mode to see more rows."}
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
                <th>Order</th>
                <th>Merchant</th>
                <th>Amount</th>
                <th>Mode</th>
                <th>Network</th>
                <th>Hint</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((order, index) => {
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
                  <tr
                    key={order.id}
                    style={{ animationDelay: `${Math.min(index, 24) * 35}ms` }}
                  >
                    <td>
                      {orgId ? (
                        <Link
                          className="plat-compliance__order"
                          to={`/platform/merchants/${orgId}?tab=compliance`}
                          title={orderTitle}
                        >
                          {order.orderNumber}
                        </Link>
                      ) : (
                        <span className="plat-compliance__order" title={orderTitle}>
                          {order.orderNumber}
                        </span>
                      )}
                    </td>
                    <td>
                      {orgId ? (
                        <Link
                          className="plat-compliance__merchant"
                          to={`/platform/merchants/${orgId}?tab=compliance`}
                          title={merchantName}
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
