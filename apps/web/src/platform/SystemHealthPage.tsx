import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AssetNetworkTables } from "./AssetNetworkTables";
import {
  getWatcherHealth,
  type WatcherHealthList,
  type WatcherHeartbeat,
} from "./api";
import { PlatformPending, PlatformTableSkeleton } from "./ui/PlatformPending";

type HealthPayload = {
  service?: string;
  status?: string;
  phase?: string;
  timestamp?: string;
  db?: string;
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

function heartbeatDetail(row: WatcherHeartbeat): string {
  return `${row.healthScore}% · lag ${formatLag(row.lagMs)} · ${row.rpcMode} / ${row.ingestMode}`;
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

  const byNetwork = new Map(
    (watcher?.items ?? []).map((row) => [row.network, row]),
  );
  const tron = byNetwork.get("tron");
  const ethereum = byNetwork.get("ethereum");

  const checks: {
    label: string;
    tone: CheckTone;
    detail: string;
  }[] = [
    {
      label: "API process",
      tone: health?.status === "ok" ? "ok" : "warn",
      detail: statusLabel(health?.status),
    },
    {
      label: "Postgres",
      tone: health?.db === "ok" ? "ok" : "warn",
      detail: statusLabel(health?.db),
    },
    {
      label: "Watcher (Tron)",
      tone: tron ? heartbeatTone(tron.status) : "warn",
      detail: tron ? heartbeatDetail(tron) : "No heartbeat yet",
    },
    {
      label: "Watcher (Ethereum)",
      tone: ethereum ? heartbeatTone(ethereum.status) : "warn",
      detail: ethereum ? heartbeatDetail(ethereum) : "No heartbeat yet",
    },
    {
      label: "Webhook delivery worker",
      tone: "ok",
      detail: "Outbox fan-out on API",
    },
  ];

  return (
    <div
      className={`plat-ops-health${enterMotion ? " is-enter" : ""}`}
    >
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

      {error ? (
        <div className="plat-ops-health__error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="plat-ops-health__kpis">
        <div className="plat-ops-health__kpi">
          <p className="plat-ops-health__kpi-label">API status</p>
          <p className="plat-ops-health__kpi-value">
            {loading && !health ? "…" : statusLabel(health?.status, "—")}
          </p>
          <p className="plat-ops-health__kpi-copy">
            {health?.service ?? "cryptogate-api"}
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
          <p className="plat-ops-health__kpi-label">Phase</p>
          <p className="plat-ops-health__kpi-value">
            {loading && !health ? "…" : health?.phase ?? "—"}
          </p>
          <p className="plat-ops-health__kpi-copy">Contract milestone tag</p>
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
              <h2 className="plat-ops-health__card-title">Checklist</h2>
              <span className="plat-ops-health__meta">
                {checks.filter((c) => c.tone === "ok").length}/{checks.length}{" "}
                ready
              </span>
            </div>
            {loading && !health ? (
              <PlatformPending
                compact
                title="Checking system health"
                copy="Probing API /health and watcher heartbeats."
              />
            ) : (
              <ul className="plat-ops-health__checks">
                {checks.map((row) => (
                  <li key={row.label} className="plat-ops-health__check">
                    <span
                      className={`plat-ops-health__dot tone-${row.tone}`}
                      aria-hidden="true"
                    />
                    <span className="plat-ops-health__check-label">
                      {row.label}
                    </span>
                    <span className="plat-ops-health__check-detail">
                      {row.detail}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

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
              <div className="plat-ops-health__pending">
                <PlatformPending
                  compact
                  title="Loading watcher heartbeats"
                  copy="Waiting for per-network watcher ticks."
                />
                <PlatformTableSkeleton columns={8} rows={3} />
              </div>
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
                        <tr key={row.network}>
                          <td>
                            <span className="plat-ops-health__net">
                              {row.network}
                            </span>
                            <span className="plat-ops-health__asset">
                              {row.asset}
                            </span>
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

        <div className="plat-ops-health__card">
          <div className="plat-ops-health__card-head">
            <h2 className="plat-ops-health__card-title">
              Connected assets &amp; networks
            </h2>
            <Link
              to="/platform/settings/networks"
              className="plat-ops-health__link"
            >
              Catalog →
            </Link>
          </div>
          <AssetNetworkTables />
        </div>
      </div>
    </div>
  );
}
