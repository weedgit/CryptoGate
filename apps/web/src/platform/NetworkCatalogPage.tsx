import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "../auth/AuthToast";
import { NetworkStatusLamp } from "../shared/NetworkStatusLamp";
import { NumberStepper } from "../ui/NumberStepper";
import {
  ApiError,
  getNetworkCatalog,
  putNetworkMaintenance,
  putPlatformNetworkRailSettings,
  type NetworkCatalog,
  type NetworkCatalogCard,
  type Session,
} from "./api";
import { AssetIcon, NetworkIcon } from "./cryptoIcons";
import { PagePending } from "./ui/PlatformPending";
import { SystemHealthPage, type WatcherLoadFn } from "./SystemHealthPage";
import {
  sessionCanManagePlatform,
  sessionIsPlatformViewerOnly,
} from "./org";
import { computeOrderabilityLamp } from "../shared/networkLamp";

type Props = { session: Session };

function statusLabel(status: NetworkCatalogCard["status"]): string {
  if (status === "maintenance") return "MAINT_MODE";
  return "CATALOGUED";
}

function pairDraftKey(network: string, asset: string): string {
  return `${asset}:${network}`;
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
    pairs: card.pairs.map((pair) => ({
      ...pair,
      lamp: computeOrderabilityLamp({
        enabled: pair.enabled,
        maintenanceActive: underMaintenance,
        ingestStatus: card.ingest.ingestStatus,
      }),
    })),
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

/** B16 — Network rail controls + B17 watcher table (no duplicated health). */
export function NetworkCatalogPage({ session }: Props) {
  const canManage = useMemo(() => sessionCanManagePlatform(session), [session]);
  const readOnly = useMemo(() => sessionIsPlatformViewerOnly(session), [session]);
  const [catalog, setCatalog] = useState<NetworkCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [watcherLoading, setWatcherLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyNetwork, setBusyNetwork] = useState<string | null>(null);
  const [savingRail, setSavingRail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftConfirms, setDraftConfirms] = useState<Record<string, string>>({});
  const [draftMin, setDraftMin] = useState<Record<string, string>>({});
  const [topbarActionsSlot, setTopbarActionsSlot] = useState<HTMLElement | null>(
    null,
  );
  const loadGen = useRef(0);
  const toggleBusyRef = useRef<string | null>(null);
  const watcherLoadRef = useRef<WatcherLoadFn | null>(null);

  useLayoutEffect(() => {
    setTopbarActionsSlot(document.getElementById("platform-topbar-actions"));
  }, []);

  const syncDrafts = useCallback((data: NetworkCatalog) => {
    const confirms: Record<string, string> = {};
    const mins: Record<string, string> = {};
    for (const card of data.items) {
      confirms[card.network] =
        card.confirmations != null ? String(card.confirmations) : "";
      for (const pair of card.pairs.filter((p) => p.enabled)) {
        mins[pairDraftKey(card.network, pair.asset)] = pair.minAmount;
      }
    }
    setDraftConfirms(confirms);
    setDraftMin(mins);
  }, []);

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
      syncDrafts(data);
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
  }, [syncDrafts]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await Promise.all([
        load({ silent: true }),
        watcherLoadRef.current?.({ silent: true }) ?? Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const refreshBusy = refreshing || loading || watcherLoading;

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

  async function onSaveRail(network: string) {
    if (!canManage || savingRail) return;
    const card = catalog?.items.find((c) => c.network === network);
    if (!card) return;

    const confirmsRaw = (draftConfirms[network] ?? "").trim();
    const confirmsNum = confirmsRaw === "" ? NaN : Number(confirmsRaw);
    if (!Number.isInteger(confirmsNum) || confirmsNum < 1 || confirmsNum > 64) {
      setError("Confirmations must be an integer from 1 to 64");
      return;
    }

    const enabledPairs = card.pairs.filter((p) => p.enabled);
    for (const pair of enabledPairs) {
      const minRaw = (draftMin[pairDraftKey(network, pair.asset)] ?? "").trim();
      if (!minRaw || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(minRaw)) {
        setError(`Min amount for ${pair.asset} must be a non-negative decimal`);
        return;
      }
    }

    const registryConfirms = card.registryConfirmations ?? card.confirmations;
    /** @type {{ requiredConfirmations?: number | null; asset?: string; minAmount?: string | null }[]} */
    const requests: {
      requiredConfirmations?: number | null;
      asset?: string;
      minAmount?: string | null;
    }[] = [];

    const confirmBody: {
      requiredConfirmations?: number | null;
    } = {};
    if (
      card.railOverride?.requiredConfirmations != null &&
      confirmsNum === registryConfirms
    ) {
      confirmBody.requiredConfirmations = null;
    } else if (confirmsNum !== card.confirmations) {
      confirmBody.requiredConfirmations = confirmsNum;
    }

    const pairBodies: {
      asset: string;
      minAmount: string | null;
    }[] = [];
    for (const pair of enabledPairs) {
      const minKey = pairDraftKey(network, pair.asset);
      const minRaw = (draftMin[minKey] ?? "").trim();
      const registryMin = pair.registryMinAmount ?? pair.minAmount;
      if (pair.minAmountOverride != null && minRaw === registryMin) {
        pairBodies.push({ asset: pair.asset, minAmount: null });
      } else if (minRaw !== pair.minAmount) {
        pairBodies.push({ asset: pair.asset, minAmount: minRaw });
      }
    }

    if (
      confirmBody.requiredConfirmations === undefined &&
      pairBodies.length === 0
    ) {
      return;
    }

    // First request may combine confirms + first pair min; rest are pair-only.
    if (confirmBody.requiredConfirmations !== undefined && pairBodies.length > 0) {
      const [first, ...rest] = pairBodies;
      requests.push({
        requiredConfirmations: confirmBody.requiredConfirmations,
        asset: first.asset,
        minAmount: first.minAmount,
      });
      for (const p of rest) {
        requests.push({ asset: p.asset, minAmount: p.minAmount });
      }
    } else if (confirmBody.requiredConfirmations !== undefined) {
      requests.push(confirmBody);
    } else {
      for (const p of pairBodies) {
        requests.push({ asset: p.asset, minAmount: p.minAmount });
      }
    }

    setSavingRail(network);
    setError(null);
    try {
      let lastConfirms = card.confirmations;
      let lastConfirmsOverride = card.railOverride?.requiredConfirmations ?? null;
      const pairUpdates = new Map<
        string,
        {
          minAmount: string;
          registryMinAmount?: string;
          minAmountOverride: string | null;
        }
      >();

      for (const body of requests) {
        const result = await putPlatformNetworkRailSettings(network, body);
        if (body.requiredConfirmations !== undefined) {
          lastConfirms = result.requiredConfirmations;
          lastConfirmsOverride = result.railOverride.requiredConfirmations;
        }
        if (body.asset) {
          pairUpdates.set(body.asset, {
            minAmount: result.minAmount ?? "",
            registryMinAmount: result.registryMinAmount ?? undefined,
            minAmountOverride: result.railOverride.minAmount,
          });
          setDraftMin((d) => ({
            ...d,
            [pairDraftKey(network, body.asset!)]: result.minAmount ?? "",
          }));
        }
      }

      setCatalog((prev) =>
        prev
          ? patchCatalogCard(prev, network, (c) => ({
              ...c,
              confirmations: lastConfirms,
              railOverride: {
                requiredConfirmations: lastConfirmsOverride,
                minAmount: c.railOverride?.minAmount ?? null,
              },
              pairs: c.pairs.map((p) => {
                const upd = pairUpdates.get(p.asset);
                return {
                  ...p,
                  requiredConfirmations: lastConfirms ?? p.requiredConfirmations,
                  ...(upd
                    ? {
                        minAmount: upd.minAmount || p.minAmount,
                        registryMinAmount:
                          upd.registryMinAmount ?? p.registryMinAmount,
                        minAmountOverride: upd.minAmountOverride,
                      }
                    : {}),
                };
              }),
              minAmount:
                pairUpdates.get(c.primaryAsset ?? "")?.minAmount ?? c.minAmount,
            }))
          : prev,
      );
      setDraftConfirms((d) => ({
        ...d,
        [network]: lastConfirms != null ? String(lastConfirms) : "",
      }));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save rail settings",
      );
    } finally {
      setSavingRail(null);
    }
  }

  const cards = catalog?.items ?? [];

  return (
    <div className="dash-page plat-network-catalog">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      {topbarActionsSlot
        ? createPortal(
            <div className="plat-ops-health__topbar-actions">
              <button
                type="button"
                className="plat-ops-health__topbar-btn"
                onClick={() => void refreshAll()}
                disabled={refreshBusy}
              >
                Refresh
              </button>
            </div>,
            topbarActionsSlot,
          )
        : null}

      {readOnly ? (
        <div className="banner banner-warn" style={{ marginBottom: 16 }}>
          Viewer — rail settings and maintenance are read-only. Contact a Platform
          Owner or Administrator to change them.
        </div>
      ) : null}

      <section className="plat-network-settings">
        <header className="plat-network-settings__head">
          <h2 className="plat-network-settings__title">Network settings</h2>
          <p className="plat-network-settings__sub">
            Confirmations, min amounts, and maintenance. Changes apply to new
            orders only.
          </p>
        </header>

        {loading && !catalog ? (
          <PagePending />
        ) : cards.length === 0 ? (
          <div className="plat-settings__card">
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
          </div>
        ) : (
          <div className="plat-network-settings__list">
            <div className="plat-network-settings__cols" aria-hidden="true">
              <span>Network</span>
              <span>Confirmations</span>
              <span>Min amounts</span>
              <span>Maint</span>
              <span />
            </div>

            {cards.map((card, index) => {
              const isMaint = card.status === "maintenance";
              const lamp =
                card.lamp ??
                computeOrderabilityLamp({
                  enabled: card.enabledCount > 0,
                  maintenanceActive: card.maintenance.active,
                  ingestStatus: card.ingest.ingestStatus,
                });
              const enabledPairs = card.pairs.filter((p) => p.enabled);
              const confirmsVal = Math.min(
                64,
                Math.max(1, Number(draftConfirms[card.network]) || 1),
              );
              const dirty =
                (draftConfirms[card.network] ?? "") !==
                  (card.confirmations != null
                    ? String(card.confirmations)
                    : "") ||
                enabledPairs.some(
                  (pair) =>
                    (draftMin[pairDraftKey(card.network, pair.asset)] ??
                      "") !== pair.minAmount,
                );

              return (
                <article
                  key={card.network}
                  className={[
                    "plat-network-rail-card",
                    isMaint ? "plat-network-rail-card--maint" : "",
                    !isMaint && lamp.code === "open"
                      ? "plat-network-rail-card--open"
                      : "",
                    card.status === "catalogued"
                      ? "plat-network-rail-card--catalogued"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className="plat-network-row__net">
                    <div className="plat-network-row__net-inner">
                      <span
                        className="plat-network-row__badge"
                        aria-hidden="true"
                      >
                        <NetworkIcon network={card.network} />
                      </span>
                      <div className="plat-network-row__net-text">
                        <span className="plat-network-row__name">
                          {card.title}
                        </span>
                        <div className="plat-network-row__lamp">
                          <NetworkStatusLamp
                            lamp={lamp}
                            title="Orderability — Online means deposits can be accepted now"
                          />
                          {isMaint ? (
                            <span className="plat-network-row__maint-tag">
                              {statusLabel(card.status)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="plat-network-row__confirms">
                    <div className="plat-network-row__confirm-controls">
                      <NumberStepper
                        className="plat-network-row__confirm-stepper"
                        inputClassName="plat-network-row__confirm-input"
                        min={1}
                        max={64}
                        step={1}
                        value={draftConfirms[card.network] ?? ""}
                        disabled={!canManage || card.enabledCount === 0}
                        title="1 – 64"
                        aria-label={`${card.title} confirmations`}
                        onChange={(raw) =>
                          setDraftConfirms((d) => ({
                            ...d,
                            [card.network]: raw,
                          }))
                        }
                      />
                      <div className="plat-network-row__slider-wrap">
                        <input
                          type="range"
                          min={1}
                          max={64}
                          step={1}
                          className="plat-network-card__slider plat-network-row__slider"
                          value={confirmsVal}
                          disabled={!canManage || card.enabledCount === 0}
                          aria-label={`${card.title} confirmations slider`}
                          style={
                            {
                              "--plat-slider-pct": `${((confirmsVal - 1) / 63) * 100}%`,
                            } as CSSProperties
                          }
                          onChange={(e) =>
                            setDraftConfirms((d) => ({
                              ...d,
                              [card.network]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="plat-network-row__mins">
                    <div className="plat-network-row__mins-inner">
                      {enabledPairs.length === 0 ? (
                        <span className="plat-network-card__asset-empty">
                          No enabled assets
                        </span>
                      ) : (
                        enabledPairs.map((pair) => {
                          const minKey = pairDraftKey(
                            card.network,
                            pair.asset,
                          );
                          const contractHint = pair.contractAddress
                            ? pair.contractAddress
                            : "Native asset";
                          return (
                            <label
                              key={pair.asset}
                              className="plat-network-row__pair"
                              title={contractHint}
                            >
                              <span className="plat-network-row__pair-asset">
                                <AssetIcon asset={pair.asset} />
                                {pair.asset}
                              </span>
                              <input
                                type="text"
                                inputMode="decimal"
                                className="plat-network-row__pair-input"
                                value={draftMin[minKey] ?? ""}
                                disabled={!canManage}
                                aria-label={`${card.title} ${pair.asset} min amount`}
                                onChange={(e) =>
                                  setDraftMin((d) => ({
                                    ...d,
                                    [minKey]: e.target.value,
                                  }))
                                }
                              />
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="plat-network-row__maint">
                    {canManage ? (
                      <button
                        type="button"
                        className={`plat-network-toggle${card.maintenance.active ? " is-on" : ""}`}
                        role="switch"
                        aria-label={`${card.title} maintenance mode`}
                        aria-checked={card.maintenance.active}
                        aria-busy={busyNetwork === card.network}
                        disabled={
                          busyNetwork === card.network ||
                          card.enabledCount === 0
                        }
                        data-tip={
                          card.enabledCount === 0
                            ? "No enabled pairs on this network"
                            : isMaint
                              ? card.maintenance.endsAt
                                ? `Maintenance on until ${new Date(card.maintenance.endsAt).toLocaleString()} — click to clear`
                                : "Clear maintenance — create-order will resume"
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

                  {canManage ? (
                    <div className="plat-network-row__save">
                      <button
                        type="button"
                        className="plat-network-card__save"
                        disabled={!dirty || savingRail === card.network}
                        data-tip={
                          dirty
                            ? "Save rail settings — applies to new orders only"
                            : "No changes to save"
                        }
                        onClick={() => void onSaveRail(card.network)}
                      >
                        {savingRail === card.network ? "…" : "Save"}
                      </button>
                    </div>
                  ) : (
                    <div className="plat-network-row__save" aria-hidden="true" />
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <SystemHealthPage
        catalog={catalog}
        loadRef={watcherLoadRef}
        hideTopbarRefresh
        onLoadingChange={setWatcherLoading}
      />
    </div>
  );
}
