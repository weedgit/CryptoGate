import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "../auth/AuthToast";
import { AssetIcon, NetworkIcon } from "../platform/cryptoIcons";
import { PlatformPending } from "../platform/ui/PlatformPending";
import { displayNetworkForPair } from "../shared/assetNetworks";
import { StatusBadge } from "../shared/StatusBadge";
import { FieldControl } from "../ui/FieldControl";
import { SearchableSelect } from "../ui/SearchableSelect";
import {
  ApiError,
  listOrders,
  ordersCsvUrl,
  type OrgAccount,
  type PaymentOrder,
  type Session,
} from "./api";
import { getMerchantOrgs, peekMerchantOrgs } from "./merchantOrgList";
import { getMerchantOrders, peekMerchantOrders } from "./merchantOrdersList";
import { matchingModeLabel } from "./matchingLabels";
import { orderStatusLabel, orderStatusTone } from "./orderStatus";
import { sessionCanExportOrders, truncateAddress } from "./org";

type DatePreset = "7d" | "30d" | "month" | "all";

type Props = { session: Session };

type VolumeStats = { count: number; volume: number };

type AssetNetworkStats = VolumeStats & {
  asset: string;
  network: string;
};

const DATE_PRESET_OPTIONS = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "month", label: "MTD" },
  { id: "all", label: "All" },
] as const;

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

function maxVolume(rows: VolumeStats[]): number {
  let max = 0;
  for (const row of rows) {
    if (row.volume > max) max = row.volume;
  }
  return max;
}

function sharePct(volume: number, max: number): number {
  if (max <= 0 || volume <= 0) return 0;
  return Math.min(100, Math.round((volume / max) * 100));
}

function presetWindowLabel(preset: DatePreset): string {
  if (preset === "all") return "All";
  if (preset === "month") return "MTD";
  return preset;
}

function VolumeCell({
  volume,
  max,
}: {
  volume: number;
  max: number;
}) {
  const pct = sharePct(volume, max);
  return (
    <span className="merchant-reports__vol">
      <span className="merchant-reports__vol-bar" aria-hidden>
        <span
          className="merchant-reports__vol-fill"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="mono merchant-reports__vol-num">
        {volume.toFixed(2)}
      </span>
    </span>
  );
}

export function ReportsPage({ session }: Props) {
  const canExport = useMemo(() => sessionCanExportOrders(session), [session]);
  const [orgs, setOrgs] = useState<OrgAccount[]>(() => peekMerchantOrgs() ?? []);
  const [preset, setPreset] = useState<DatePreset>("30d");
  const [siteOrgId, setSiteOrgId] = useState<string>("");
  const [items, setItems] = useState<PaymentOrder[]>(() => peekMerchantOrders() ?? []);
  const [loading, setLoading] = useState(() => peekMerchantOrders() == null);
  const [hasLoaded, setHasLoaded] = useState(() => peekMerchantOrders() != null);
  const [error, setError] = useState<string | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] =
    useState<HTMLElement | null>(null);
  const [topbarCenterSlot, setTopbarCenterSlot] =
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

  const siteSelectOptions = useMemo(
    () => [
      { id: "", label: "All sites" },
      ...siteOptions.map((o) => ({
        id: o.id,
        label: o.name,
        hint: o.type === "merchant_site" ? "Site" : "Merchant",
      })),
    ],
    [siteOptions],
  );

  useLayoutEffect(() => {
    setTopbarActionsSlot(document.getElementById("merchant-topbar-actions"));
    setTopbarCenterSlot(document.getElementById("merchant-topbar-center"));
  }, []);

  const load = useCallback(async () => {
    if (siteOrgId) {
      setLoading(true);
    } else if (!hasLoaded) {
      setLoading(true);
    }
    setError(null);
    try {
      if (siteOrgId) {
        const [rows, orgRows] = await Promise.all([
          listOrders({ limit: 200, orgId: siteOrgId }),
          getMerchantOrgs().catch(() => [] as OrgAccount[]),
        ]);
        setItems(rows);
        setOrgs(orgRows);
      } else {
        const [rows, orgRows] = await Promise.all([
          getMerchantOrders(),
          getMerchantOrgs(),
        ]);
        setItems(rows);
        setOrgs(orgRows);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load report data",
      );
      setItems([]);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [siteOrgId, hasLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  const { from, to } = useMemo(() => presetRange(preset), [preset]);

  const filtered = useMemo(
    () => items.filter((o) => inRange(orderTimestamp(o), from, to)),
    [items, from, to],
  );

  const statusCounts = useMemo(() => {
    const map = new Map<string, VolumeStats>();
    for (const o of filtered) {
      const cur = map.get(o.status) ?? { count: 0, volume: 0 };
      cur.count += 1;
      cur.volume += volumeForOrder(o);
      map.set(o.status, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [filtered]);

  const assetCounts = useMemo(() => {
    const map = new Map<string, AssetNetworkStats>();
    for (const o of filtered) {
      const key = `${o.asset}|${o.network}`;
      const cur = map.get(key) ?? {
        asset: o.asset,
        network: o.network,
        count: 0,
        volume: 0,
      };
      cur.count += 1;
      cur.volume += volumeForOrder(o);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.volume - a.volume);
  }, [filtered]);

  const siteCounts = useMemo(() => {
    const map = new Map<string, VolumeStats>();
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
    const map = new Map<
      string,
      VolumeStats & { sortKey: string }
    >();
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
    const map = new Map<string, VolumeStats>();
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

  const modeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of filtered) {
      map.set(o.matchingMode, (map.get(o.matchingMode) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const completedVolume = useMemo(
    () => sumCompletedVolume(filtered),
    [filtered],
  );
  const anomalyCount = useMemo(
    () => filtered.filter((o) => o.status === "payment_anomaly").length,
    [filtered],
  );

  const statusMaxVol = useMemo(
    () => maxVolume(statusCounts.map(([, s]) => s)),
    [statusCounts],
  );
  const assetMaxVol = useMemo(() => maxVolume(assetCounts), [assetCounts]);
  const siteMaxVol = useMemo(
    () => maxVolume(siteCounts.map(([, s]) => s)),
    [siteCounts],
  );
  const dayMaxVol = useMemo(
    () => maxVolume(dayCounts.map(([, s]) => s)),
    [dayCounts],
  );
  const cashierMaxVol = useMemo(
    () => maxVolume(cashierCounts.map(([, s]) => s)),
    [cashierCounts],
  );

  function onExport() {
    window.open(
      ordersCsvUrl({ orgId: siteOrgId || undefined, limit: 5000 }),
      "_blank",
    );
  }

  return (
    <div className="reports-page merchant-reports">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      {topbarCenterSlot
        ? createPortal(
            <div
              className="plat-period-controls plat-period-controls--topbar merchant-reports__topbar-period"
              aria-label="Date range"
            >
              <div
                className="plat-period-pills plat-period-pills--topbar"
                role="group"
                aria-label="Report date range"
              >
                {DATE_PRESET_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`plat-period-pill${
                      preset === opt.id ? " is-active" : ""
                    }`}
                    onClick={() => setPreset(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>,
            topbarCenterSlot,
          )
        : null}

      {topbarActionsSlot
        ? createPortal(
            <div
              className="merchant-reports__topbar-actions"
              aria-label="Report actions"
            >
              {siteOptions.length > 1 ? (
                <label
                  className="merchant-reports__topbar-site"
                  htmlFor="reports-site"
                >
                  <span className="sr-only">Site</span>
                  <FieldControl icon="globe">
                    <SearchableSelect
                      id="reports-site"
                      value={siteOrgId}
                      options={siteSelectOptions}
                      onChange={setSiteOrgId}
                      allowEmpty={false}
                      ariaLabel="Site"
                      hideTriggerIcon
                    />
                  </FieldControl>
                </label>
              ) : null}
              {canExport ? (
                <button
                  type="button"
                  className="btn-primary btn-inline"
                  onClick={onExport}
                >
                  Export CSV
                </button>
              ) : null}
            </div>,
            topbarActionsSlot,
          )
        : null}

      {loading && (!hasLoaded || siteOrgId) ? (
        <PlatformPending
          title="Loading report"
          copy="Aggregating payment orders for the selected range."
        />
      ) : (
        <>
          <div className="merchant-reports__kpis">
            <article className="merchant-reports__kpi merchant-reports__kpi--volume">
              <div className="merchant-reports__kpi-top">
                <span className="merchant-reports__kpi-icon" aria-hidden>
                  <svg viewBox="0 0 20 20" width="22" height="22" fill="none">
                    <path
                      d="M3.5 14.5 8 10l3 3 5.5-6.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M13.5 6.5H17v3.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="merchant-reports__kpi-label">
                  Completed volume
                </span>
              </div>
              <p className="merchant-reports__kpi-value merchant-reports__kpi-value--fund">
                <span className="merchant-reports__kpi-amount">
                  {completedVolume.toFixed(2)}
                </span>
                <span className="merchant-reports__kpi-unit">USDT</span>
              </p>
            </article>

            <article className="merchant-reports__kpi merchant-reports__kpi--orders">
              <div className="merchant-reports__kpi-top">
                <span className="merchant-reports__kpi-icon" aria-hidden>
                  <svg viewBox="0 0 20 20" width="22" height="22" fill="none">
                    <rect
                      x="3.5"
                      y="4.5"
                      width="13"
                      height="11"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M6.5 8.5h7M6.5 11.5h4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="merchant-reports__kpi-label">
                  Orders in range
                </span>
              </div>
              <p className="merchant-reports__kpi-value">{filtered.length}</p>
            </article>

            <article
              className={`merchant-reports__kpi merchant-reports__kpi--anomaly${
                anomalyCount > 0 ? " is-alert" : ""
              }`}
            >
              <div className="merchant-reports__kpi-top">
                <span className="merchant-reports__kpi-icon" aria-hidden>
                  <svg viewBox="0 0 20 20" width="22" height="22" fill="none">
                    <path
                      d="M10 3.8 17.2 16H2.8L10 3.8Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M10 8.2v3.6M10 14.2h.01"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="merchant-reports__kpi-label">Anomalies</span>
              </div>
              <p className="merchant-reports__kpi-value">{anomalyCount}</p>
            </article>

            <article className="merchant-reports__kpi merchant-reports__kpi--window">
              <div className="merchant-reports__kpi-top">
                <span className="merchant-reports__kpi-icon" aria-hidden>
                  <svg viewBox="0 0 20 20" width="22" height="22" fill="none">
                    <circle
                      cx="10"
                      cy="10"
                      r="6.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M10 6.5V10l2.5 1.8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="merchant-reports__kpi-label">Date window</span>
              </div>
              <p className="merchant-reports__kpi-value">
                {presetWindowLabel(preset)}
              </p>
            </article>
          </div>

          <div className="merchant-reports__grid">
            <section className="merchant-reports__card">
              <header className="merchant-reports__card-head">
                <h2 className="merchant-reports__card-title">By status</h2>
                <span className="merchant-reports__card-pill">
                  {statusCounts.length} statuses
                </span>
              </header>
              {statusCounts.length === 0 ? (
                <p className="muted merchant-reports__empty">
                  No orders in this range.
                </p>
              ) : (
                <div className="merchant-reports__table">
                  <div className="merchant-reports__thead">
                    <span>Status</span>
                    <span>Count</span>
                    <span>Volume</span>
                  </div>
                  {statusCounts.map(([status, stats]) => (
                    <div key={status} className="merchant-reports__row">
                      <span className="merchant-reports__row-label">
                        <StatusBadge tone={orderStatusTone(status)}>
                          {orderStatusLabel(status)}
                        </StatusBadge>
                      </span>
                      <span className="mono">{stats.count}</span>
                      <VolumeCell volume={stats.volume} max={statusMaxVol} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="merchant-reports__card">
              <header className="merchant-reports__card-head">
                <h2 className="merchant-reports__card-title">
                  By asset / network
                </h2>
                <span className="merchant-reports__card-pill">
                  {assetCounts.length} pairs
                </span>
              </header>
              {assetCounts.length === 0 ? (
                <p className="muted merchant-reports__empty">
                  No orders in this range.
                </p>
              ) : (
                <div className="merchant-reports__table">
                  <div className="merchant-reports__thead">
                    <span>Asset</span>
                    <span>Orders</span>
                    <span>Volume</span>
                  </div>
                  {assetCounts.map((row) => (
                    <div
                      key={`${row.asset}|${row.network}`}
                      className="merchant-reports__row"
                    >
                      <span className="merchant-reports__pair">
                        <span
                          className="merchant-reports__pair-icons"
                          aria-hidden
                        >
                          <AssetIcon asset={row.asset} />
                          <NetworkIcon network={row.network} />
                        </span>
                        <span className="merchant-reports__pair-text">
                          <strong>{row.asset}</strong>
                          <em>
                            {displayNetworkForPair(row.asset, row.network)}
                          </em>
                        </span>
                      </span>
                      <span className="mono">{row.count}</span>
                      <VolumeCell volume={row.volume} max={assetMaxVol} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="merchant-reports__card">
              <header className="merchant-reports__card-head">
                <h2 className="merchant-reports__card-title">By site</h2>
                <span className="merchant-reports__card-pill">
                  {siteCounts.length} locations
                </span>
              </header>
              {siteCounts.length === 0 ? (
                <p className="muted merchant-reports__empty">
                  No orders in this range.
                </p>
              ) : (
                <div className="merchant-reports__table">
                  <div className="merchant-reports__thead">
                    <span>Location</span>
                    <span>Orders</span>
                    <span>Volume</span>
                  </div>
                  {siteCounts.map(([key, stats]) => (
                    <div key={key} className="merchant-reports__row">
                      <span className="merchant-reports__row-label">{key}</span>
                      <span className="mono">{stats.count}</span>
                      <VolumeCell volume={stats.volume} max={siteMaxVol} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="merchant-reports__card">
              <header className="merchant-reports__card-head">
                <h2 className="merchant-reports__card-title">By day</h2>
                <span className="merchant-reports__card-pill">
                  Last {dayCounts.length || 0} days
                </span>
              </header>
              {dayCounts.length === 0 ? (
                <p className="muted merchant-reports__empty">
                  No orders in this range.
                </p>
              ) : (
                <div className="merchant-reports__table">
                  <div className="merchant-reports__thead">
                    <span>Date</span>
                    <span>Orders</span>
                    <span>Volume</span>
                  </div>
                  {dayCounts.map(([key, stats]) => (
                    <div key={key} className="merchant-reports__row">
                      <span className="merchant-reports__row-label">{key}</span>
                      <span className="mono">{stats.count}</span>
                      <VolumeCell volume={stats.volume} max={dayMaxVol} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="merchant-reports__card">
              <header className="merchant-reports__card-head">
                <h2 className="merchant-reports__card-title">By cashier</h2>
                <span className="merchant-reports__card-pill">
                  {cashierCounts.length} creators
                </span>
              </header>
              {cashierCounts.length === 0 ? (
                <p className="muted merchant-reports__empty">
                  No orders in this range.
                </p>
              ) : (
                <div className="merchant-reports__table">
                  <div className="merchant-reports__thead">
                    <span>Created by</span>
                    <span>Orders</span>
                    <span>Volume</span>
                  </div>
                  {cashierCounts.map(([who, stats]) => (
                    <div key={who} className="merchant-reports__row">
                      <span className="mono merchant-reports__row-label">
                        {who}
                      </span>
                      <span className="mono">{stats.count}</span>
                      <VolumeCell volume={stats.volume} max={cashierMaxVol} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="merchant-reports__card">
              <header className="merchant-reports__card-head">
                <h2 className="merchant-reports__card-title">Matching modes</h2>
                <span className="merchant-reports__card-pill">
                  {modeCounts.length} modes
                </span>
              </header>
              {modeCounts.length === 0 ? (
                <p className="muted merchant-reports__empty">
                  No orders in this range.
                </p>
              ) : (
                <div className="merchant-reports__table merchant-reports__table--cols2">
                  <div className="merchant-reports__thead">
                    <span>Mode</span>
                    <span>Count</span>
                  </div>
                  {modeCounts.map(([mode, count]) => (
                    <div key={mode} className="merchant-reports__row">
                      <span className="merchant-reports__row-label">
                        {matchingModeLabel(mode)}
                      </span>
                      <span className="mono">{count}</span>
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
