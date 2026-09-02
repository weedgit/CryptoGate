import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "../auth/AuthToast";
import { networkShortLabel } from "../shared/assetNetworks";
import {
  getWatcherHealth,
  type WatcherHealthList,
} from "./api";
import { AssetIcon, NetworkIcon } from "./cryptoIcons";
import { PagePending } from "./ui/PlatformPending";

type HealthPayload = {
  service?: string;
  status?: string;
  phase?: string;
  timestamp?: string;
  db?: string;
  webhook?: string;
  webhookDetail?: string;
  webhookPendingOutbox?: number;
  webhookOverdueDeliveries?: number;
  webhookLastTickAt?: string | null;
};

type CheckTone = "ok" | "warn";

function formatLag(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} m`;
}

function heartbeatTone(status: string): CheckTone {
  return status === "ok" ? "ok" : "warn";
}

function statusLabel(value: string | undefined, fallback = "Unknown"): string {
  if (!value) return fallback;
  if (value === "ok") return "OK";
  return value.replace(/_/g, " ");
}

/** B17 — System health from live API /health + watcher heartbeats. */
export function SystemHealthPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [watcher, setWatcher] = useState<WatcherHealthList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [topbarActionsSlot, setTopbarActionsSlot] = useState<HTMLElement | null>(
    null,
  );

  useLayoutEffect(() => {
    setTopbarActionsSlot(document.getElementById("platform-topbar-actions"));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base =
        (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(
          /\/$/,
          "",
        ) || "";
      const [healthRes, watcherSnap] = await Promise.all([
        fetch(`${base}/health`, {
          headers: { Accept: "application/json" },
        }),
        getWatcherHealth().catch(() => null),
      ]);
      if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
      setHealth((await healthRes.json()) as HealthPayload);
      setWatcher(watcherSnap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Health check failed");
      setHealth(null);
      setWatcher(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(id);
  }, [load]);

  const enterOnceRef = useRef(false);
  const [enterMotion, setEnterMotion] = useState(false);
  useEffect(() => {
    if (loading || enterOnceRef.current) return;
    enterOnceRef.current = true;
    const raf = window.requestAnimationFrame(() => setEnterMotion(true));
    const clear = window.setTimeout(() => setEnterMotion(false), 900);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(clear);
    };
  }, [loading]);

  return (
    <div
      className={`plat-ops-health${enterMotion ? " is-enter" : ""}`}
    >
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      {topbarActionsSlot
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

      <div className="plat-ops-health__kpis">
        <div className="plat-ops-health__kpi">
          <p className="plat-ops-health__kpi-label">API status</p>
          <p className="plat-ops-health__kpi-value">
            {loading && !health ? "…" : statusLabel(health?.status, "—")}
          </p>
          <p className="plat-ops-health__kpi-copy">
            {health?.service ?? "paymentgate-api"}
          </p>
        </div>
        <div className="plat-ops-health__kpi">
          <p className="plat-ops-health__kpi-label">Database</p>
          <p className="plat-ops-health__kpi-value">
            {loading && !health ? "…" : statusLabel(health?.db, "—")}
          </p>
          <p className="plat-ops-health__kpi-copy">SELECT 1 probe</p>
        </div>
        <div className="plat-ops-health__kpi">
          <p className="plat-ops-health__kpi-label">Webhook</p>
          <p className="plat-ops-health__kpi-value">
            {loading && !health
              ? "…"
              : statusLabel(health?.webhook, "—")}
          </p>
          <p className="plat-ops-health__kpi-copy">
            {loading && !health
              ? "Delivery worker"
              : health?.webhookDetail?.trim() || "Outbox fan-out on API"}
          </p>
        </div>
        <div className="plat-ops-health__kpi">
          <p className="plat-ops-health__kpi-label">Checked at</p>
          <p className="plat-ops-health__kpi-value plat-ops-health__kpi-value--sm">
            {loading && !health
              ? "…"
              : health?.timestamp
                ? new Date(health.timestamp).toLocaleTimeString()
                : "—"}
          </p>
          <p className="plat-ops-health__kpi-copy">Auto-refresh every 15s</p>
        </div>
      </div>

      <div className="plat-ops-health__panels">
        <div className="plat-ops-health__stack">
          <div className="plat-ops-health__card">
            <div className="plat-ops-health__card-head">
              <h2 className="plat-ops-health__card-title">
                Watcher health by network
              </h2>
              <span className="plat-ops-health__meta">
                {watcher?.checkedAt
                  ? `Checked ${new Date(watcher.checkedAt).toLocaleTimeString()}`
                  : "Awaiting heartbeats"}
              </span>
            </div>

            {watcher?.note ? (
              <p className="plat-ops-health__note">{watcher.note}</p>
            ) : null}

            {loading && !watcher ? (
              <PagePending />
            ) : null}

            {!loading && !watcher?.items?.length ? (
              <div className="plat-ops-health__empty" role="status">
                <p className="plat-ops-health__empty-title">
                  No watcher heartbeats yet
                </p>
                <p className="plat-ops-health__empty-copy">
                  Start <code>apps/watcher</code> with <code>DATABASE_URL</code>{" "}
                  after migration 027 to populate lag and score per network.
                </p>
              </div>
            ) : null}

            {!loading && watcher?.items?.length ? (
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
                    {watcher.items.map((row) => {
                      const tone = heartbeatTone(row.status);
                      return (
                        <tr key={`${row.network}:${row.asset}`}>
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
                          <td>
                            <span
                              className={`plat-ops-health__badge tone-${tone}`}
                            >
                              {statusLabel(row.status)}
                            </span>
                          </td>
                          <td className="mono">{row.healthScore}%</td>
                          <td className="mono">{formatLag(row.lagMs)}</td>
                          <td className="plat-ops-health__cell-muted">
                            {row.rpcOk ? "OK" : "No"} · {row.rpcMode}
                          </td>
                          <td className="plat-ops-health__cell-muted">
                            {row.ingestMode}
                          </td>
                          <td className="mono">
                            {row.openOrders} / {row.awaitingConfirmations}
                          </td>
                          <td className="plat-ops-health__cell-muted">
                            {new Date(row.tickAt).toLocaleTimeString()}
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
