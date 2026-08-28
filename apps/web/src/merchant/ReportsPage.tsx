import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ApiError,
  listOrders,
  ordersCsvUrl,
  type PaymentOrder,
  type Session,
} from "./api";
import { matchingModeLabel } from "./matchingLabels";
import { orderStatusLabel } from "./orderStatus";
import {
  networkLabel,
  sessionCanExportOrders,
  truncateAddress,
} from "./org";

type DatePreset = "7d" | "30d" | "month" | "all";

type Props = { session: Session };

function presetRange(preset: DatePreset): { from: Date | null; to: Date } {
  const to = new Date();
  if (preset === "all") return { from: null, to };
  const from = new Date(to);
  if (preset === "7d") {
    from.setDate(from.getDate() - 7);
  } else if (preset === "30d") {
    from.setDate(from.getDate() - 30);
  } else {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  }
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

function inRange(iso: string, from: Date | null, to: Date): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  if (from && t < from.getTime()) return false;
  return t <= to.getTime();
}

function sumCompletedVolume(orders: PaymentOrder[]): number {
  let total = 0;
  for (const o of orders) {
    if (o.status !== "completed" && o.status !== "confirmed") continue;
    const n = Number(o.payableAmount.amount);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

export function ReportsPage({ session }: Props) {
  const canExport = useMemo(() => sessionCanExportOrders(session), [session]);
  const siteOptions = useMemo(
    () =>
      session.memberships.filter(
        (m) =>
          m.orgType === "merchant" ||
          m.orgType === "merchant_site" ||
          m.orgType == null,
      ),
    [session],
  );
  const [preset, setPreset] = useState<DatePreset>("30d");
  const [siteOrgId, setSiteOrgId] = useState<string>("");
  const [items, setItems] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] =
    useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTopbarActionsSlot(document.getElementById("merchant-topbar-actions"));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listOrders({
        limit: 200,
        orgId: siteOrgId || undefined,
      });
      setItems(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load report data");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [siteOrgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { from, to } = useMemo(() => presetRange(preset), [preset]);

  const filtered = useMemo(
    () => items.filter((o) => inRange(o.expiresAt, from, to)),
    [items, from, to],
  );

  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of filtered) {
      map.set(o.status, (map.get(o.status) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const assetCounts = useMemo(() => {
    const map = new Map<string, { count: number; volume: number }>();
    for (const o of filtered) {
      const key = `${o.asset} · ${networkLabel(o.network)}`;
      const cur = map.get(key) ?? { count: 0, volume: 0 };
      cur.count += 1;
      if (o.status === "completed" || o.status === "confirmed") {
        const n = Number(o.payableAmount.amount);
        if (Number.isFinite(n)) cur.volume += n;
      }
      map.set(key, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].volume - a[1].volume);
  }, [filtered]);

  const cashierCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of filtered) {
      const key = o.createdBy ? truncateAddress(o.createdBy, 6, 4) : "—";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const completedVolume = useMemo(() => sumCompletedVolume(filtered), [filtered]);
  const anomalyCount = useMemo(
    () => filtered.filter((o) => o.status === "payment_anomaly").length,
    [filtered],
  );

  function onExport() {
    window.open(
      ordersCsvUrl({ orgId: siteOrgId || undefined, limit: 5000 }),
      "_blank",
    );
  }

  return (
    <div className="reports-page">
      {canExport && topbarActionsSlot
        ? createPortal(
            <button type="button" className="btn-primary" onClick={onExport}>
              Export CSV
            </button>,
            topbarActionsSlot,
          )
        : null}

      <div className="reports-filters panel">
        <div className="reports-filter-row">
          <label className="reports-filter">
            <span>Date range</span>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as DatePreset)}
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="month">This month</option>
              <option value="all">All loaded</option>
            </select>
          </label>
          {siteOptions.length > 1 ? (
            <label className="reports-filter">
              <span>Site</span>
              <select
                value={siteOrgId}
                onChange={(e) => setSiteOrgId(e.target.value)}
              >
                <option value="">All sites</option>
                {siteOptions.map((m) => (
                  <option key={m.orgId} value={m.orgId}>
                    {m.orgType === "merchant_site" ? "Site" : "Merchant"} ·{" "}
                    {truncateAddress(m.orgId, 8, 4)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <p className="muted reports-note">
          Summary uses orders loaded from the API (up to 200). CSV export includes
          matching_mode, payable_amount, receive_address, address_source, hd_index,
          and memo_or_tag for up to 5,000 rows in scope.
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <p className="muted">Loading report data…</p>
      ) : (
        <>
          <div className="kpi-row">
            <div className="kpi-card">
              <p className="kpi-label">COMPLETED VOLUME</p>
              <p className="kpi-value">{completedVolume.toFixed(2)}</p>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">ORDERS IN RANGE</p>
              <p className="kpi-value">{filtered.length}</p>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">ANOMALIES</p>
              <p className="kpi-value tone-anomaly-text">{anomalyCount}</p>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">DATE WINDOW</p>
              <p className="kpi-value kpi-value-sm">
                {preset === "all" ? "All loaded" : preset === "month" ? "MTD" : preset}
              </p>
            </div>
          </div>

          <div className="reports-grid">
            <section className="panel reports-breakdown">
              <h2>By status</h2>
              {statusCounts.length === 0 ? (
                <p className="muted">No orders in this range.</p>
              ) : (
                <div className="breakdown-table cols-2">
                  <div className="breakdown-head">
                    <span>Status</span>
                    <span>Count</span>
                  </div>
                  {statusCounts.map(([status, count]) => (
                    <div key={status} className="breakdown-row">
                      <span>{orderStatusLabel(status)}</span>
                      <span className="mono">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel reports-breakdown">
              <h2>By asset / network</h2>
              {assetCounts.length === 0 ? (
                <p className="muted">No orders in this range.</p>
              ) : (
                <div className="breakdown-table">
                  <div className="breakdown-head">
                    <span>Asset</span>
                    <span>Orders</span>
                    <span>Volume</span>
                  </div>
                  {assetCounts.map(([key, stats]) => (
                    <div key={key} className="breakdown-row">
                      <span>{key}</span>
                      <span className="mono">{stats.count}</span>
                      <span className="mono">{stats.volume.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel reports-breakdown">
              <h2>By cashier</h2>
              {cashierCounts.length === 0 ? (
                <p className="muted">No orders in this range.</p>
              ) : (
                <div className="breakdown-table cols-2">
                  <div className="breakdown-head">
                    <span>Created by</span>
                    <span>Orders</span>
                  </div>
                  {cashierCounts.map(([who, count]) => (
                    <div key={who} className="breakdown-row">
                      <span className="mono">{who}</span>
                      <span className="mono">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel reports-breakdown">
              <h2>Matching modes</h2>
              {filtered.length === 0 ? (
                <p className="muted">No orders in this range.</p>
              ) : (
                <div className="breakdown-table cols-2">
                  <div className="breakdown-head">
                    <span>Mode</span>
                    <span>Count</span>
                  </div>
                  {[...new Set(filtered.map((o) => o.matchingMode))]
                    .sort()
                    .map((mode) => (
                      <div key={mode} className="breakdown-row">
                        <span>{matchingModeLabel(mode)}</span>
                        <span className="mono">
                          {filtered.filter((o) => o.matchingMode === mode).length}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
