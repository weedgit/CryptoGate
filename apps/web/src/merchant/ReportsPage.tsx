import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  listOrders,
  listOrgs,
  ordersCsvUrl,
  type OrgAccount,
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

function orderTimestamp(o: PaymentOrder): string {
  return o.createdAt ?? o.expiresAt;
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

function volumeForOrder(o: PaymentOrder): number {
  if (o.status !== "completed" && o.status !== "confirmed") return 0;
  const n = Number(o.payableAmount.amount);
  return Number.isFinite(n) ? n : 0;
}

export function ReportsPage({ session }: Props) {
  const canExport = useMemo(() => sessionCanExportOrders(session), [session]);
  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [preset, setPreset] = useState<DatePreset>("30d");
  const [siteOrgId, setSiteOrgId] = useState<string>("");
  const [items, setItems] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] =
    useState<HTMLElement | null>(null);

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orgs) map.set(o.id, o.name);
    return map;
  }, [orgs]);

  const siteOptions = useMemo(
    () =>
      orgs.filter(
        (o) => o.type === "merchant" || o.type === "merchant_site",
      ),
    [orgs],
  );

  useLayoutEffect(() => {
    setTopbarActionsSlot(document.getElementById("merchant-topbar-actions"));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, orgRows] = await Promise.all([
        listOrders({
          limit: 200,
          orgId: siteOrgId || undefined,
        }),
        listOrgs().catch(() => [] as OrgAccount[]),
      ]);
      setItems(rows);
      setOrgs(orgRows);
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
    () => items.filter((o) => inRange(orderTimestamp(o), from, to)),
    [items, from, to],
  );

  const statusCounts = useMemo(() => {
    const map = new Map<string, { count: number; volume: number }>();
    for (const o of filtered) {
      const cur = map.get(o.status) ?? { count: 0, volume: 0 };
      cur.count += 1;
      cur.volume += volumeForOrder(o);
      map.set(o.status, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [filtered]);

  const assetCounts = useMemo(() => {
    const map = new Map<string, { count: number; volume: number }>();
    for (const o of filtered) {
      const key = `${o.asset} · ${networkLabel(o.network)}`;
      const cur = map.get(key) ?? { count: 0, volume: 0 };
      cur.count += 1;
      cur.volume += volumeForOrder(o);
      map.set(key, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].volume - a[1].volume);
  }, [filtered]);

  const siteCounts = useMemo(() => {
    const map = new Map<string, { count: number; volume: number }>();
    for (const o of filtered) {
      const key =
        o.orgName ??
        (o.orgId ? orgNameById.get(o.orgId) : null) ??
        o.orgId ??
        "Unknown";
      const cur = map.get(key) ?? { count: 0, volume: 0 };
      cur.count += 1;
      cur.volume += volumeForOrder(o);
      map.set(key, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].volume - a[1].volume);
  }, [filtered, orgNameById]);

  const dayCounts = useMemo(() => {
    const map = new Map<string, { count: number; volume: number; sortKey: string }>();
    for (const o of filtered) {
      const iso = orderTimestamp(o);
      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) continue;
      const sortKey = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const cur = map.get(label) ?? { count: 0, volume: 0, sortKey };
      cur.count += 1;
      cur.volume += volumeForOrder(o);
      map.set(label, cur);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].sortKey.localeCompare(a[1].sortKey))
      .slice(0, 14);
  }, [filtered]);

  const cashierCounts = useMemo(() => {
    const map = new Map<string, { count: number; volume: number }>();
    for (const o of filtered) {
      const key =
        o.createdByEmail ??
        (o.createdBy ? truncateAddress(o.createdBy, 6, 4) : "—");
      const cur = map.get(key) ?? { count: 0, volume: 0 };
      cur.count += 1;
      cur.volume += volumeForOrder(o);
      map.set(key, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
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
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
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
                {siteOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.type === "merchant_site" ? "Site" : "Merchant"} · {o.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <p className="muted reports-note">
          Summary by order <strong>created</strong> date (up to 200 loaded rows).
          CSV export includes org name, merchant reference, received amount, and
          cashier email for up to 5,000 rows.
        </p>
      </div>

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
                <div className="breakdown-table">
                  <div className="breakdown-head">
                    <span>Status</span>
                    <span>Count</span>
                    <span>Volume</span>
                  </div>
                  {statusCounts.map(([status, stats]) => (
                    <div key={status} className="breakdown-row">
                      <span>{orderStatusLabel(status)}</span>
                      <span className="mono">{stats.count}</span>
                      <span className="mono">{stats.volume.toFixed(2)}</span>
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
              <h2>By site</h2>
              {siteCounts.length === 0 ? (
                <p className="muted">No orders in this range.</p>
              ) : (
                <div className="breakdown-table">
                  <div className="breakdown-head">
                    <span>Location</span>
                    <span>Orders</span>
                    <span>Volume</span>
                  </div>
                  {siteCounts.map(([key, stats]) => (
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
              <h2>By day</h2>
              {dayCounts.length === 0 ? (
                <p className="muted">No orders in this range.</p>
              ) : (
                <div className="breakdown-table">
                  <div className="breakdown-head">
                    <span>Date</span>
                    <span>Orders</span>
                    <span>Volume</span>
                  </div>
                  {dayCounts.map(([key, stats]) => (
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
                <div className="breakdown-table">
                  <div className="breakdown-head">
                    <span>Created by</span>
                    <span>Orders</span>
                    <span>Volume</span>
                  </div>
                  {cashierCounts.map(([who, stats]) => (
                    <div key={who} className="breakdown-row">
                      <span className="mono">{who}</span>
                      <span className="mono">{stats.count}</span>
                      <span className="mono">{stats.volume.toFixed(2)}</span>
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
