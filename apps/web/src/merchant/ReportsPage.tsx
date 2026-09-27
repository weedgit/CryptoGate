import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "../auth/AuthToast";
import { AssetIcon, NetworkIcon } from "../platform/cryptoIcons";
import { PagePending } from "../platform/ui/PlatformPending";
import { AnimatedMetric } from "../shared/AnimatedMetric";
import { DashKpiCard } from "../platform/ui/DashKpiCard";
import { displayNetworkForPair } from "../shared/assetNetworks";
import { StatusBadge } from "../shared/StatusBadge";
import { FieldControl } from "../ui/FieldControl";
import { SearchableSelect } from "../ui/SearchableSelect";
import {
  ApiError,
  ordersCsvUrl,
  type OrgAccount,
  type Session,
} from "./api";
import { getMerchantOrgs, peekMerchantOrgs } from "./merchantOrgList";
import {
  getDashboardReports,
  peekDashboardReports,
  type DashboardReports,
  type DashboardReportsQuery,
} from "../shared/dashboardApi";
import { toDateInputValue } from "../shared/dashboardPeriod";
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

const EMPTY_REPORT: DashboardReports = {
  totals: { orders: 0, settledVolumeUsd: 0, anomalies: 0 },
  byStatus: [],
  byAsset: [],
  byOrg: [],
  byDay: [],
  byCreator: [],
  byMode: [],
};

const DATE_PRESET_OPTIONS = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "month", label: "MTD" },
  { id: "all", label: "All" },
] as const;

/** Local calendar dates for the preset; "all" = no bounds. */
function presetQuery(preset: DatePreset): { from: string | null; to: string | null } {
  if (preset === "all") return { from: null, to: null };
  const to = new Date();
  const from = new Date(to);
  if (preset === "7d") from.setDate(from.getDate() - 7);
  else if (preset === "30d") from.setDate(from.getDate() - 30);
  else from.setDate(1);
  return { from: toDateInputValue(from), to: toDateInputValue(to) };
}

function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return day;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
  const reportQuery = useMemo<DashboardReportsQuery>(
    () => ({ ...presetQuery(preset), orgId: siteOrgId || null }),
    [preset, siteOrgId],
  );
  const [report, setReport] = useState<DashboardReports | null>(() =>
    peekDashboardReports(reportQuery),
  );
  const reportSeq = useRef(0);
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
    setTopbarActionsSlot(document.getElementById("platform-topbar-actions"));
    setTopbarCenterSlot(document.getElementById("platform-topbar-center"));
  }, []);

  useEffect(() => {
    void getMerchantOrgs()
      .then(setOrgs)
      .catch(() => undefined);
  }, []);

  const load = useCallback(async (q: DashboardReportsQuery) => {
    const seq = ++reportSeq.current;
    const cached = peekDashboardReports(q);
    setReport(cached);
    setError(null);
    try {
      const next = await getDashboardReports(q);
      if (seq === reportSeq.current) setReport(next);
    } catch (err) {
      if (seq !== reportSeq.current) return;
      setError(
        err instanceof ApiError ? err.message : "Failed to load report data",
      );
      setReport((prev) => prev ?? EMPTY_REPORT);
    }
  }, []);

  useEffect(() => {
    void load(reportQuery);
  }, [load, reportQuery]);

  const loading = report == null;
  const data = report ?? EMPTY_REPORT;

  const statusCounts = useMemo(
    () =>
      data.byStatus.map(
        (r) => [r.status, { count: r.count, volume: r.volumeUsd }] as const,
      ),
    [data],
  );
  const assetCounts = useMemo<AssetNetworkStats[]>(
    () =>
      data.byAsset.map((r) => ({
        asset: r.asset,
        network: r.network,
        count: r.count,
        volume: r.volumeUsd,
      })),
    [data],
  );
  const siteCounts = useMemo(
    () =>
      data.byOrg.map(
        (r) =>
          [
            r.orgName ?? orgNameById.get(r.orgId) ?? r.orgId ?? "Unknown",
            { count: r.count, volume: r.volumeUsd },
          ] as const,
      ),
    [data, orgNameById],
  );
  const dayCounts = useMemo(
    () =>
      data.byDay.map(
        (r) => [dayLabel(r.day), { count: r.count, volume: r.volumeUsd }] as const,
      ),
    [data],
  );
  const cashierCounts = useMemo(
    () =>
      data.byCreator.map(
        (r) =>
          [
            r.email ?? (r.userId ? truncateAddress(r.userId, 6, 4) : "—"),
            { count: r.count, volume: r.volumeUsd },
          ] as const,
      ),
    [data],
  );
  const modeCounts = useMemo(
    () => data.byMode.map((r) => [r.mode, r.count] as const),
    [data],
  );
  const completedVolume = data.totals.settledVolumeUsd;
  const anomalyCount = data.totals.anomalies;
  const orderCount = data.totals.orders;

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
    <div className="dash-page plat-dash pg-dash reports-page merchant-reports">
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

      {loading ? (
        <PagePending />
      ) : (
        <>
          <div className="pg-dash__status-row merchant-dash__status-row--four">
            <DashKpiCard
              accent="violet"
              label="Completed volume"
              value={
                <span className="pg-kpi__money">
                  $<AnimatedMetric value={completedVolume} decimals={2} />
                </span>
              }
              hint="Settled orders in range"
            />
            <DashKpiCard
              accent="gold"
              label="Orders in range"
              value={<AnimatedMetric value={orderCount} />}
              hint="All statuses"
            />
            <DashKpiCard
              accent={anomalyCount > 0 ? "danger" : "ok"}
              label="Attention"
              value={<AnimatedMetric value={anomalyCount} />}
              hint={anomalyCount > 0 ? "Needs review" : "All clear"}
            />
            <DashKpiCard
              accent="slate"
              label="Date window"
              value={presetWindowLabel(preset)}
            />
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
