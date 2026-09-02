import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthToast } from "../auth/AuthToast";
import { CopyableChainValue } from "../shared/CopyableChainValue";
import { NetworkStatusLamp } from "../shared/NetworkStatusLamp";
import {
  ApiError,
  getNetworkCatalog,
  putNetworkMaintenance,
  type NetworkCatalog,
  type NetworkCatalogCard,
  type Session,
} from "./api";
import { NetworkIcon } from "./cryptoIcons";
import { PagePending } from "./ui/PlatformPending";
import {
  sessionCanManagePlatform,
  sessionIsPlatformViewerOnly,
} from "./org";
import { computeOrderabilityLamp } from "../shared/networkLamp";

type Props = { session: Session };

function shortContract(addr: string | null): string {
  if (!addr) return "Native";
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function statusLabel(status: NetworkCatalogCard["status"]): string {
  if (status === "active") return "ACTIVE";
  if (status === "maintenance") return "MAINT_MODE";
  return "CATALOGUED";
}

/** Catalog completeness from registry — never a fake watcher %. */
function catalogStatusText(card: NetworkCatalogCard): string {
  if (card.pairCount <= 0) return "—";
  return `${card.enabledCount}/${card.pairCount} enabled`;
}

/** Bar width: real watcher health when present; else registry fraction. */
function barWidth(card: NetworkCatalogCard): number {
  if (card.ingest.healthScore != null) {
    return Math.min(100, Math.max(0, card.ingest.healthScore));
  }
  return Math.round(card.catalogFraction * 100);
}

function barTone(
  card: NetworkCatalogCard,
): "ok" | "amber" | "muted" | "warn" {
  const code = card.lamp?.code;
  if (code === "paused" || card.status === "maintenance") return "amber";
  if (code === "down" || card.ingest.ingestStatus === "down") return "warn";
  if (code === "off" || card.ingest.ingestStatus === "stub" || card.ingest.ingestStatus === "unknown") {
    return "muted";
  }
  if (code === "open" || card.status === "active") return "ok";
  return "muted";
}

function formatLag(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} m`;
}

type MaintenancePatch = {
  active: boolean;
  message: string | null;
  startedAt?: string | null;
  endsAt?: string | null;
  updatedAt?: string | null;
};

function applyMaintenanceToCard(
  card: NetworkCatalogCard,
  maint: MaintenancePatch,
): NetworkCatalogCard {
  const underMaintenance = maint.active;
  const status: NetworkCatalogCard["status"] = underMaintenance
    ? "maintenance"
    : card.enabledCount > 0
      ? "active"
      : "catalogued";
  const lamp = computeOrderabilityLamp({
    enabled: card.enabledCount > 0,
    maintenanceActive: underMaintenance,
    ingestStatus: card.ingest.ingestStatus,
  });
  return {
    ...card,
    status,
    lamp,
    maintenance: {
      active: underMaintenance,
      message: underMaintenance ? maint.message : null,
      startedAt: underMaintenance ? (maint.startedAt ?? null) : null,
      endsAt: underMaintenance ? (maint.endsAt ?? null) : null,
      updatedAt: maint.updatedAt ?? new Date().toISOString(),
    },
  };
}

function patchCatalogCard(
  catalog: NetworkCatalog,
  network: string,
  patch: (card: NetworkCatalogCard) => NetworkCatalogCard,
): NetworkCatalog {
  return {
    ...catalog,
    checkedAt: new Date().toISOString(),
    items: catalog.items.map((card) =>
      card.network === network ? patch(card) : card,
    ),
  };
}

/** B16 — Network & asset catalog (trustworthy values from API). */
export function NetworkCatalogPage({ session }: Props) {
  const canManage = useMemo(() => sessionCanManagePlatform(session), [session]);
  const readOnly = useMemo(() => sessionIsPlatformViewerOnly(session), [session]);
  const [catalog, setCatalog] = useState<NetworkCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyNetwork, setBusyNetwork] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadGen = useRef(0);
  const toggleBusyRef = useRef<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const gen = ++loadGen.current;
    if (!opts?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await getNetworkCatalog();
      if (gen !== loadGen.current) return;
      setCatalog(data);
    } catch (err) {
      if (gen !== loadGen.current) return;
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load network catalog",
      );
    } finally {
      if (gen !== loadGen.current) return;
      if (!opts?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onToggleMaintenance(network: string) {
    if (!canManage || toggleBusyRef.current === network) return;
    const snapshot = catalog;
    if (!snapshot) return;
    const row = snapshot.items.find((item) => item.network === network);
    if (!row) return;

    toggleBusyRef.current = network;
    setBusyNetwork(network);
    setError(null);

    const nextActive = !row.maintenance.active;
    const message = nextActive
      ? `${row.title} deposits paused — platform maintenance.`
      : null;

    setCatalog((prev) =>
      prev
        ? patchCatalogCard(prev, network, (card) =>
            applyMaintenanceToCard(card, {
              active: nextActive,
              message,
              startedAt: nextActive ? new Date().toISOString() : null,
              endsAt: null,
            }),
          )
        : prev,
    );

    try {
      const result = await putNetworkMaintenance(network, {
        active: nextActive,
        message,
      });
      setCatalog((prev) =>
        prev
          ? patchCatalogCard(prev, network, (card) =>
              applyMaintenanceToCard(card, {
                active: result.active,
                message: result.message,
                startedAt: result.startedAt,
                endsAt: result.endsAt,
                updatedAt: result.updatedAt,
              }),
            )
          : prev,
      );
    } catch (err) {
      setCatalog(snapshot);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to update maintenance",
      );
    } finally {
      toggleBusyRef.current = null;
      setBusyNetwork(null);
    }
  }

  const cards = catalog?.items ?? [];

  return (
    <div className="dash-page plat-network-catalog">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      {readOnly ? (
        <div className="banner banner-warn" style={{ marginBottom: 16 }}>
          Viewer — network maintenance is read-only. Contact a Platform Owner or
          Administrator to pause deposits.
        </div>
      ) : null}

      {loading && !catalog ? (
        <PagePending />
      ) : cards.length === 0 ? (
        <section className="plat-settings__card">
          <div className="plat-settings__card-body">
            <p className="muted">
              {error
                ? "Network catalog could not be loaded."
                : "No networks in the catalog for this environment."}
            </p>
            {error ? (
              <button
                type="button"
                className="btn-secondary plat-settings__submit"
                style={{ marginTop: 12 }}
                onClick={() => void load()}
              >
                Retry
              </button>
            ) : null}
          </div>
        </section>
      ) : (
        <div className="plat-network-catalog__grid">
          {cards.map((card, index) => {
            const isMaint = card.status === "maintenance";
            const isActive = card.status === "active";
            const width = barWidth(card);
            const tone = barTone(card);
            const lamp =
              card.lamp ??
              computeOrderabilityLamp({
                enabled: card.enabledCount > 0,
                maintenanceActive: card.maintenance.active,
                ingestStatus: card.ingest.ingestStatus,
              });
            const watcherLine = card.ingest.tickAt
              ? `Watcher · lag ${formatLag(card.ingest.lagMs)}${
                  card.ingest.rpcMode ? ` · ${card.ingest.rpcMode}` : ""
                }`
              : "Watcher · no heartbeat yet";

            return (
              <article
                key={card.network}
                className={[
                  "plat-network-card",
                  "panel",
                  `plat-network-card--${card.network.replace(/_/g, "-")}`,
                  isMaint ? "plat-network-card--maint" : "",
                  !isMaint && lamp.code === "open" ? "plat-network-card--open" : "",
                  isActive ? "plat-network-card--active" : "",
                  card.status === "catalogued" ? "plat-network-card--catalogued" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="plat-network-card__head">
                  <div className="plat-network-card__identity">
                    <span className="plat-network-card__badge" aria-hidden="true">
                      <NetworkIcon network={card.network} />
                    </span>
                    <div className="plat-network-card__titles">
                      <h2 className="plat-network-card__title">{card.title}</h2>
                      <p className="plat-network-card__watcher">{watcherLine}</p>
                    </div>
                  </div>
                  <div className="plat-network-card__head-status">
                    <NetworkStatusLamp
                      lamp={lamp}
                      title="Orderability — Open means deposits can be accepted now"
                    />
                    {isMaint ? (
                      <span className="plat-network-card__status plat-network-card__status--maint">
                        {statusLabel(card.status)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="plat-network-card__health">
                  <div className="plat-network-card__health-row">
                    <span>Catalog status</span>
                    <span
                      className={`plat-network-card__health-value plat-network-card__health-value--${
                        isMaint ? "maint" : card.status
                      }`}
                    >
                      {catalogStatusText(card)}
                    </span>
                  </div>
                  <div
                    className="plat-network-card__bar"
                    role="progressbar"
                    aria-valuenow={width}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={
                      card.ingest.healthScore != null
                        ? `${card.title} ingest health ${card.ingest.healthScore}%`
                        : `${card.title} catalog ${catalogStatusText(card)}`
                    }
                  >
                    <div
                      className={`plat-network-card__bar-fill plat-network-card__bar-fill--${tone}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <div className="plat-network-card__health-row plat-network-card__health-row--sub">
                    <span>Ingest</span>
                    <span className="plat-network-card__health-value">
                      {card.ingest.ingestLabel}
                      {card.ingest.healthScore != null
                        ? ` · ${card.ingest.healthScore}%`
                        : ""}
                    </span>
                  </div>
                </div>

                <div className="plat-network-card__meta">
                  <div className="plat-network-card__meta-row">
                    <span>Confirmations</span>
                    <span className="plat-network-card__meta-value">
                      {card.confirmations ?? "—"}
                    </span>
                  </div>
                  <div className="plat-network-card__meta-row">
                    <span>Min amount</span>
                    <span className="plat-network-card__meta-value">
                      {card.minAmount != null && card.primaryAsset
                        ? `${card.minAmount} ${card.primaryAsset}`
                        : "—"}
                    </span>
                  </div>
                  <div className="plat-network-card__meta-row">
                    <span>Contract</span>
                    <span className="plat-network-card__meta-value">
                      {card.contractAddress ? (
                        <CopyableChainValue
                          value={card.contractAddress}
                          network={card.network}
                          kind="address"
                          display={shortContract(card.contractAddress)}
                        />
                      ) : (
                        "Native"
                      )}
                    </span>
                  </div>
                  <div className="plat-network-card__meta-row">
                    <span>Assets</span>
                    <span className="plat-network-card__meta-value">
                      {card.enabledCount}/{card.pairCount} enabled
                      {card.ingest.openOrders > 0
                        ? ` · ${card.ingest.openOrders} open`
                        : ""}
                    </span>
                  </div>
                </div>

                <div className="plat-network-card__divider" />

                <div className="plat-network-card__footer">
                  <span>
                    Maintenance Mode
                    {isMaint && card.maintenance.endsAt
                      ? ` · until ${new Date(card.maintenance.endsAt).toLocaleString()}`
                      : ""}
                  </span>
                  {canManage ? (
                    <button
                      type="button"
                      className={`plat-network-toggle${card.maintenance.active ? " is-on" : ""}`}
                      role="switch"
                      aria-checked={card.maintenance.active}
                      aria-busy={busyNetwork === card.network}
                      disabled={
                        busyNetwork === card.network || card.enabledCount === 0
                      }
                      title={
                        card.enabledCount === 0
                          ? "No enabled pairs on this network"
                          : isMaint
                            ? "Clear maintenance — create-order will resume"
                            : "Pause deposits — create-order returns 422; merchants see a banner"
                      }
                      onClick={() => void onToggleMaintenance(card.network)}
                    >
                      <span className="plat-network-toggle__knob" />
                    </button>
                  ) : (
                    <span
                      className={`plat-network-card__maint-state${
                        card.maintenance.active ? " is-on" : ""
                      }`}
                      aria-label={
                        card.maintenance.active
                          ? "Maintenance on"
                          : "Maintenance off"
                      }
                    >
                      {card.maintenance.active ? "On" : "Off"}
                    </span>
                  )}
                </div>

                <div className="plat-network-card__icon-corner" aria-hidden="true">
                  <NetworkIcon network={card.network} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
