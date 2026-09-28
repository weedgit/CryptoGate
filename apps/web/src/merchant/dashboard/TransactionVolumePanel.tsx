import { useEffect, useMemo, useRef, useState } from "react";
import {
  chartLabelsFor,
  getDashboardSeries,
  peekDashboardSeries,
  type DashboardQuery,
  type DashboardSeries,
  type DashboardSeriesMetric,
} from "../../shared/dashboardApi";
import { VolumeChart, type VolumeChartZoomApi } from "../../platform/charts/VolumeChart";
import { ChartHelpButton } from "../../platform/ui/ChartHelpButton";
import { VolumeFilterSelect } from "../../platform/ui/VolumeFilterSelect";
import {
  chartFilterAsset,
  chartFilterDetail,
  volumeFilterFromSelection,
  type VolumeChartFilter,
  type VolumeSelection,
} from "../../platform/volumeFilter";

const TOTAL_METRICS: DashboardSeriesMetric[] = ["volume", "settled"];
const FILTER_METRICS: DashboardSeriesMetric[] = ["volume", "volumeAsset"];

export const MERCHANT_VOLUME_CHART_HELP =
  "Settled payment-order volume for your business (all sites) in the selected period. " +
  "Use the filter to show one asset, one network, or one network + asset pair. " +
  "With an asset selected, USD + asset draws the USD value and the native amount together. " +
  "Use + / − to zoom the time window; drag to pan when zoomed; double-click or Reset to show the full period.";

function filterAssetNetwork(filter: VolumeChartFilter): {
  asset: string | null;
  network: string | null;
} {
  if (filter.scope === "asset") return { asset: filter.asset, network: null };
  if (filter.scope === "network") return { asset: null, network: filter.network };
  if (filter.scope === "pair") return { asset: filter.asset, network: filter.network };
  return { asset: null, network: null };
}

type Props = {
  query: DashboardQuery;
  /** Bump (Refresh / live events) to refetch with `fresh`. */
  reloadToken?: number;
};

/** Merchant-scoped Transaction Volume chart (same panel as the platform dashboard). */
export function TransactionVolumePanel({ query, reloadToken = 0 }: Props) {
  const [selection, setSelection] = useState<VolumeSelection | null>(null);
  const [compareUsdAsset, setCompareUsdAsset] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const zoomApiRef = useRef<VolumeChartZoomApi | null>(null);

  const filter: VolumeChartFilter = useMemo(
    () => volumeFilterFromSelection(selection),
    [selection],
  );
  const chartDetail = chartFilterDetail(filter);
  const selectedAsset = chartFilterAsset(filter);
  const canCompare = selectedAsset != null;

  useEffect(() => {
    setCompareUsdAsset(canCompare);
  }, [selectedAsset, canCompare]);

  const [totalSeries, setTotalSeries] = useState<DashboardSeries | null>(() =>
    peekDashboardSeries(query, { metrics: TOTAL_METRICS }),
  );
  const [filteredSeries, setFilteredSeries] = useState<DashboardSeries | null>(null);
  const [failed, setFailed] = useState(false);
  const lastReloadRef = useRef(reloadToken);

  useEffect(() => {
    const { asset, network } = filterAssetNetwork(filter);
    const all = filter.scope === "all";
    const opts = all
      ? { metrics: TOTAL_METRICS }
      : { metrics: FILTER_METRICS, asset, network };
    const fresh = reloadToken !== lastReloadRef.current;
    lastReloadRef.current = reloadToken;
    const apply = all ? setTotalSeries : setFilteredSeries;
    if (!all) setFilteredSeries(fresh ? null : peekDashboardSeries(query, opts));
    else if (!fresh) {
      const cached = peekDashboardSeries(query, opts);
      if (cached) setTotalSeries(cached);
    }
    let cancelled = false;
    setFailed(false);
    getDashboardSeries({ ...query, fresh }, opts)
      .then((next) => {
        if (!cancelled) apply(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [query, filter, reloadToken]);

  const { series, labels, secondarySeries, valueUnit, secondaryUnit } = useMemo(() => {
    const single = {
      secondarySeries: undefined as number[] | undefined,
      valueUnit: "usd" as string,
      secondaryUnit: undefined as string | undefined,
    };
    const source = filter.scope === "all" ? totalSeries : filteredSeries;
    if (!source) return { ...single, series: [] as number[], labels: [] as string[] };
    const lbls = chartLabelsFor(source.keys, source.interval);
    const usd = source.series.volume ?? [];
    if (filter.scope === "all" || !selectedAsset) {
      return { ...single, series: usd, labels: lbls };
    }
    const native = source.series.volumeAsset ?? [];
    if (compareUsdAsset) {
      return {
        series: native,
        labels: lbls,
        secondarySeries: usd,
        valueUnit: selectedAsset as string,
        secondaryUnit: "usd" as string | undefined,
      };
    }
    return { ...single, series: native, labels: lbls, valueUnit: selectedAsset as string };
  }, [filter, totalSeries, filteredSeries, selectedAsset, compareUsdAsset]);

  return (
    <div className="panel dash-chart-panel glass-tone-slate pg-chart-panel merchant-dash__volume">
      <div className="dash-chart-panel__head">
        <div className="dash-chart-panel__title-row">
          <div className="pg-chart-panel__heading">
            <span className="pg-chart-panel__title-icon" aria-hidden>
              <img
                className="pg-chart-panel__title-icon-img"
                src="/brand/volume-chart-icon.png"
                alt=""
                width={48}
                height={48}
                draggable={false}
              />
            </span>
            <div className="pg-chart-panel__heading-text">
              <h2>Transaction Volume</h2>
              <p>
                {chartDetail
                  ? compareUsdAsset && canCompare
                    ? `USD (convert rate) vs ${selectedAsset} over time.`
                    : `Successful ${chartDetail} volume over time.`
                  : "Your successful transaction volume over time."}
              </p>
            </div>
          </div>
          <div className="dash-chart-panel__filters">
            <VolumeFilterSelect selection={selection} onChange={setSelection} />
            <label
              className={`volume-compare-toggle${canCompare ? "" : " is-disabled"}`}
              title={
                canCompare
                  ? `Show USD (convert rate) and ${selectedAsset} together`
                  : "Select an asset first to compare USD vs native amount"
              }
            >
              <input
                type="checkbox"
                checked={canCompare && compareUsdAsset}
                disabled={!canCompare}
                onChange={(e) => setCompareUsdAsset(e.target.checked)}
              />
              <span>{canCompare ? `USD + ${selectedAsset}` : "USD + asset"}</span>
            </label>
          </div>
          <div className="dash-chart-panel__tools">
            <div className="volume-chart__zoom-bar volume-chart__zoom-bar--tools">
              {zoomed ? (
                <button
                  type="button"
                  className="volume-chart__zoom-reset"
                  onClick={() => zoomApiRef.current?.reset()}
                >
                  Reset
                </button>
              ) : null}
              <button
                type="button"
                className="volume-chart__zoom-btn"
                aria-label="Zoom out"
                title="Zoom out"
                onClick={() => zoomApiRef.current?.zoomOut()}
              >
                −
              </button>
              <button
                type="button"
                className="volume-chart__zoom-btn"
                aria-label="Zoom in"
                title="Zoom in"
                onClick={() => zoomApiRef.current?.zoomIn()}
              >
                +
              </button>
            </div>
            <ChartHelpButton label="Volume chart help" text={MERCHANT_VOLUME_CHART_HELP} />
          </div>
        </div>
      </div>
      {failed && series.length === 0 ? (
        <p className="merchant-dash__volume-error" role="status">
          Couldn’t load volume. Use Refresh to try again.
        </p>
      ) : (
        <VolumeChart
          values={series}
          labels={labels}
          secondaryValues={secondarySeries}
          valueUnit={valueUnit}
          secondaryUnit={secondaryUnit}
          showZoomBar={false}
          onZoomedChange={setZoomed}
          zoomApiRef={zoomApiRef}
        />
      )}
    </div>
  );
}
