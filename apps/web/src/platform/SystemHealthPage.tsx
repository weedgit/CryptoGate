import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "../auth/AuthToast";
import { networkShortLabel } from "../shared/assetNetworks";
import { NetworkStatusLamp } from "../shared/NetworkStatusLamp";
import {
  getWatcherHealth,
  type NetworkCatalog,
  type NetworkOrderabilityLamp,
  type WatcherHeartbeat,
  type WatcherHealthList,
} from "./api";
import { AssetIcon, NetworkIcon } from "./cryptoIcons";
import { PagePending } from "./ui/PlatformPending";

export type WatcherLoadFn = (opts?: { silent?: boolean }) => Promise<void>;

type Props = {
  /** Live catalog from Network page — keeps lamps in sync with maintenance toggles. */
  catalog: NetworkCatalog | null;
  /** Parent registers watcher reload for unified Network Refresh. */
  loadRef?: MutableRefObject<WatcherLoadFn | null>;
  /** When true, parent owns the topbar Refresh control. */
  hideTopbarRefresh?: boolean;
  /** Report watcher loading so parent can disable unified Refresh. */
  onLoadingChange?: (loading: boolean) => void;
};

type TableRow = {
  network: string;
  asset: string;
  lamp: NetworkOrderabilityLamp;
  heartbeat: WatcherHeartbeat | null;
};

function formatLag(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} m`;
}

function pairKey(network: string, asset: string): string {
  return `${asset}:${network}`;
}

/** B17 — Connected assets & networks (embedded under Network catalog). */
export function SystemHealthPage({
  catalog,
  loadRef,
  hideTopbarRefresh = false,
  onLoadingChange,
}: Props) {
  const [watcher, setWatcher] = useState<WatcherHealthList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [topbarActionsSlot, setTopbarActionsSlot] = useState<HTMLElement | null>(
    null,
  );

  useLayoutEffect(() => {
    if (hideTopbarRefresh) {
      setTopbarActionsSlot(null);
      return;
    }
    setTopbarActionsSlot(document.getElementById("platform-topbar-actions"));
  }, [hideTopbarRefresh]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      setWatcher(await getWatcherHealth());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Watcher health failed");
      setWatcher(null);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loadRef) return;
    loadRef.current = load;
    return () => {
      loadRef.current = null;
    };
  }, [load, loadRef]);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load({ silent: true });
    }, 15000);
    return () => window.clearInterval(id);
  }, [load]);

  const enterOnceRef = useRef(false);
  const [enterMotion, setEnterMotion] = useState(false);
  useEffect(() => {
    if ((loading && !catalog) || enterOnceRef.current) return;
    enterOnceRef.current = true;
    const raf = window.requestAnimationFrame(() => setEnterMotion(true));
    const clear = window.setTimeout(() => setEnterMotion(false), 900);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(clear);
    };
  }, [loading, catalog]);

  const rows = useMemo((): TableRow[] => {
    const heartbeatByPair = new Map<string, WatcherHeartbeat>();
    for (const hb of watcher?.items ?? []) {
      heartbeatByPair.set(pairKey(hb.network, hb.asset), hb);
    }

    if (!catalog) return [];

    const out: TableRow[] = [];
    for (const card of catalog.items) {
      for (const pair of card.pairs) {
        out.push({
          network: card.network,
          asset: pair.asset,
          lamp: pair.lamp,
          heartbeat:
            heartbeatByPair.get(pairKey(card.network, pair.asset)) ?? null,
        });
      }
    }
    return out.sort((a, b) => {
      const net = networkShortLabel(a.network).localeCompare(
        networkShortLabel(b.network),
      );
      if (net !== 0) return net;
      return a.asset.localeCompare(b.asset);
    });
  }, [catalog, watcher]);

  const checkedAt = catalog?.checkedAt ?? watcher?.checkedAt;
  const awaitingCatalog = !catalog && loading;

  return (
    <div
      className={`plat-ops-health${enterMotion ? " is-enter" : ""}`}
    >
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      {topbarActionsSlot && !hideTopbarRefresh
        ? createPortal(
            <div className="plat-ops-health__topbar-actions">
              <button
                type="button"
                className="plat-ops-health__topbar-btn"
                onClick={() => void load()}
                disabled={loading}
              >
                Refresh
              </button>
            </div>,
            topbarActionsSlot,
          )
        : null}

      <div className="plat-ops-health__panels">
        <div className="plat-ops-health__stack">
          <div className="plat-ops-health__card">
            <div className="plat-ops-health__card-head">
              <h2 className="plat-ops-health__card-title">
                Connected assets &amp; networks
              </h2>
              <span className="plat-ops-health__meta">
                {checkedAt
                  ? `Checked ${new Date(checkedAt).toLocaleTimeString()}`
                  : "Awaiting status"}
              </span>
            </div>

            {watcher?.note ? (
              <p className="plat-ops-health__note">{watcher.note}</p>
            ) : null}

            {awaitingCatalog || (loading && rows.length === 0) ? (
              <PagePending />
            ) : null}

            {!awaitingCatalog && !loading && rows.length === 0 ? (
              <div className="plat-ops-health__empty" role="status">
                <p className="plat-ops-health__empty-title">
                  No asset / network pairs
                </p>
                <p className="plat-ops-health__empty-copy">
                  The network catalog has no pairs for this chain environment.
                </p>
              </div>
            ) : null}

            {rows.length > 0 ? (
              <div className="plat-ops-health__table-wrap">
                <table className="plat-ops-health__table">
                  <thead>
                    <tr>
                      <th>Network</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th>Lag</th>
                      <th>RPC</th>
                      <th>Ingest</th>
                      <th>Open / confirm</th>
                      <th>Last tick</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const hb = row.heartbeat;
                      return (
                        <tr key={pairKey(row.network, row.asset)}>
                          <td>
                            <div className="plat-ops-health__net-cell">
                              <NetworkIcon network={row.network} />
                              <div className="plat-ops-health__net-text">
                                <span className="plat-ops-health__net">
                                  {networkShortLabel(row.network)}
                                </span>
                                <span className="plat-ops-health__asset">
                                  <AssetIcon asset={row.asset} />
                                  <span>{row.asset}</span>
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="plat-ops-health__status-cell">
                            <NetworkStatusLamp
                              lamp={row.lamp}
                              title="Orderability — Online means this pair can accept payments now"
                            />
                          </td>
                          <td className="mono">
                            {hb ? `${hb.healthScore}%` : "—"}
                          </td>
                          <td className="mono">{formatLag(hb?.lagMs)}</td>
                          <td className="plat-ops-health__cell-muted">
                            {hb
                              ? `${hb.rpcOk ? "OK" : "No"} · ${hb.rpcMode}`
                              : "—"}
                          </td>
                          <td className="plat-ops-health__cell-muted">
                            {hb?.ingestMode ?? "—"}
                          </td>
                          <td className="mono">
                            {hb
                              ? `${hb.openOrders} / ${hb.awaitingConfirmations}`
                              : "—"}
                          </td>
                          <td className="plat-ops-health__cell-muted">
                            {hb
                              ? new Date(hb.tickAt).toLocaleTimeString()
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
