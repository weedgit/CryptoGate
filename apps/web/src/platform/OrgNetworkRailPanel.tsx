import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { AuthToast } from "../auth/AuthToast";
import { NetworkStatusLamp } from "../shared/NetworkStatusLamp";
import { networkShortLabel } from "../shared/assetNetworks";
import { NumberStepper } from "../ui/NumberStepper";
import {
  ApiError,
  getNetworkCatalog,
  getPlatformOrgNetworkRailSettings,
  getPlatformSiteNetworkRailSettings,
  putPlatformOrgNetworkRailSettings,
  putPlatformSiteNetworkRailSettings,
  type NetworkOrderabilityLamp,
  type ScopedNetworkRailSettings,
  type Session,
} from "./api";
import { AssetIcon, NetworkIcon } from "./cryptoIcons";
import { sessionCanManagePlatform } from "./org";
import { PlatformPending } from "./ui/PlatformPending";

type Scope = "merchant" | "site";

type Props = {
  session: Session;
  scope: Scope;
  /** Merchant org id or site org id */
  scopeId: string;
};

function pairKey(network: string, asset: string): string {
  return `${asset}:${network}`;
}

async function loadScoped(
  scope: Scope,
  scopeId: string,
  network: string,
): Promise<ScopedNetworkRailSettings> {
  return scope === "merchant"
    ? getPlatformOrgNetworkRailSettings(scopeId, network)
    : getPlatformSiteNetworkRailSettings(scopeId, network);
}

async function saveScoped(
  scope: Scope,
  scopeId: string,
  network: string,
  body: {
    requiredConfirmations?: number | null;
    asset?: string;
    minAmount?: string | null;
  },
): Promise<ScopedNetworkRailSettings> {
  return scope === "merchant"
    ? putPlatformOrgNetworkRailSettings(scopeId, network, body)
    : putPlatformSiteNetworkRailSettings(scopeId, network, body);
}

function clampConfirm(raw: string, floor: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return floor;
  return Math.min(64, Math.max(floor, Math.round(n)));
}

/**
 * Platform detail panel: raise-only confirms + per-asset mins for one merchant or site.
 * Table-style rows — mirrors Network catalog / doc/image/Network.png.
 */
export function OrgNetworkRailPanel({ session, scope, scopeId }: Props) {
  const canManage = useMemo(() => sessionCanManagePlatform(session), [session]);
  const [rows, setRows] = useState<ScopedNetworkRailSettings[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [lamps, setLamps] = useState<
    Record<string, NetworkOrderabilityLamp | undefined>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftConfirms, setDraftConfirms] = useState<Record<string, string>>({});
  const [draftMin, setDraftMin] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const parentShort = scope === "merchant" ? "platform" : "merchant";

  const syncDrafts = useCallback((items: ScopedNetworkRailSettings[]) => {
    const confirms: Record<string, string> = {};
    const mins: Record<string, string> = {};
    for (const row of items) {
      confirms[row.network] = String(row.effectiveConfirmations);
      for (const pair of row.pairs) {
        mins[pairKey(row.network, pair.asset)] = pair.effectiveMinAmount;
      }
    }
    setDraftConfirms(confirms);
    setDraftMin(mins);
  }, []);

  const load = useCallback(async () => {
    if (!scopeId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const catalog = await getNetworkCatalog();
      const titleMap: Record<string, string> = {};
      const lampMap: Record<string, NetworkOrderabilityLamp | undefined> = {};
      for (const card of catalog.items) {
        titleMap[card.network] = card.title;
        lampMap[card.network] = card.lamp;
      }
      setTitles(titleMap);
      setLamps(lampMap);

      const networks = catalog.items
        .filter((c) => c.enabledCount > 0)
        .map((c) => c.network);
      const items = await Promise.all(
        networks.map((network) => loadScoped(scope, scopeId, network)),
      );
      setRows(items);
      syncDrafts(items);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load network rail settings",
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [scope, scopeId, syncDrafts]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(network: string) {
    if (!canManage || saving) return;
    const row = rows.find((r) => r.network === network);
    if (!row) return;

    const confirmsRaw = (draftConfirms[network] ?? "").trim();
    const confirmsNum = Number(confirmsRaw);
    if (
      !Number.isInteger(confirmsNum) ||
      confirmsNum < row.parentFloorConfirmations ||
      confirmsNum > 64
    ) {
      setError(
        `Confirmations must be an integer from ${row.parentFloorConfirmations} to 64`,
      );
      return;
    }

    for (const pair of row.pairs) {
      const minRaw = (draftMin[pairKey(network, pair.asset)] ?? "").trim();
      if (!minRaw || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(minRaw)) {
        setError(`Min amount for ${pair.asset} must be a non-negative decimal`);
        return;
      }
    }

    const requests: {
      requiredConfirmations?: number | null;
      asset?: string;
      minAmount?: string | null;
    }[] = [];

    const confirmBody: { requiredConfirmations?: number | null } = {};
    if (
      row.overrideConfirmations != null &&
      confirmsNum === row.parentFloorConfirmations
    ) {
      confirmBody.requiredConfirmations = null;
    } else if (confirmsNum !== row.effectiveConfirmations) {
      confirmBody.requiredConfirmations = confirmsNum;
    } else if (
      confirmsNum !== row.parentFloorConfirmations &&
      row.overrideConfirmations == null
    ) {
      confirmBody.requiredConfirmations = confirmsNum;
    }

    const pairBodies: { asset: string; minAmount: string | null }[] = [];
    for (const pair of row.pairs) {
      const minKey = pairKey(network, pair.asset);
      const minRaw = (draftMin[minKey] ?? "").trim();
      if (
        pair.overrideMinAmount != null &&
        minRaw === pair.parentFloorMinAmount
      ) {
        pairBodies.push({ asset: pair.asset, minAmount: null });
      } else if (minRaw !== pair.effectiveMinAmount) {
        pairBodies.push({ asset: pair.asset, minAmount: minRaw });
      } else if (
        minRaw !== pair.parentFloorMinAmount &&
        pair.overrideMinAmount == null
      ) {
        pairBodies.push({ asset: pair.asset, minAmount: minRaw });
      }
    }

    if (
      confirmBody.requiredConfirmations === undefined &&
      pairBodies.length === 0
    ) {
      return;
    }

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

    setSaving(network);
    setError(null);
    try {
      let latest = row;
      for (const body of requests) {
        latest = await saveScoped(scope, scopeId, network, body);
      }
      setRows((prev) => {
        const next = prev.map((r) => (r.network === network ? latest : r));
        syncDrafts(next);
        return next;
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save rail settings",
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="org-network-rail-panel org-network-rail-panel--table">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      <header className="org-network-rail-panel__intro">
        <div className="org-network-rail-panel__intro-main">
          <div className="org-network-rail-panel__intro-title-row">
            <h2 className="org-network-rail-panel__intro-title">Networks</h2>
            <button
              type="button"
              className="org-network-rail-panel__refresh"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Refresh network rails"
              title="Refresh"
            >
              {loading ? "…" : "↻"}
            </button>
          </div>
          <p className="org-network-rail-panel__intro-sub">
            Optional overrides above the {parentShort} minimum. New orders only.
          </p>
        </div>
        <span className="org-network-rail-panel__count">
          {loading
            ? "…"
            : `${rows.length} network${rows.length === 1 ? "" : "s"}`}
        </span>
      </header>

      {loading ? (
        <div className="org-network-rail-panel__pending">
          <PlatformPending
            compact
            title="Loading rails"
            copy="Fetching network settings for this account."
          />
        </div>
      ) : null}

      {!loading && rows.length === 0 ? (
        <div className="org-network-rail-panel__empty" role="status">
          <p className="org-network-rail-panel__empty-title">No enabled networks</p>
          <p className="org-network-rail-panel__empty-copy">
            Enable networks in the platform catalog to configure rails here.
          </p>
        </div>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="org-network-rail-panel__table-shell">
          <div className="org-network-rail-panel__cols" aria-hidden="true">
            <span>Network</span>
            <span>Confirmations</span>
            <span>Min amounts</span>
            <span />
          </div>

          <div className="org-network-rail-panel__table">
            {rows.map((row, index) => {
              const floor = row.parentFloorConfirmations;
              const confirmsVal = clampConfirm(
                draftConfirms[row.network] ?? String(floor),
                floor,
              );
              const dirty =
                (draftConfirms[row.network] ?? "") !==
                  String(row.effectiveConfirmations) ||
                row.pairs.some(
                  (pair) =>
                    (draftMin[pairKey(row.network, pair.asset)] ?? "") !==
                    pair.effectiveMinAmount,
                );
              const inheritingConfirms = row.overrideConfirmations == null;
              const title =
                titles[row.network] || networkShortLabel(row.network);
              const lamp = lamps[row.network];
              const span = Math.max(1, 64 - floor);
              const sliderPct = `${((confirmsVal - floor) / span) * 100}%`;

              return (
                <article
                  key={row.network}
                  className="org-network-rail-panel__row"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className="org-network-rail-panel__cell org-network-rail-panel__cell--net">
                    <span className="org-network-rail-panel__rail-icon">
                      <NetworkIcon network={row.network} />
                    </span>
                    <div className="org-network-rail-panel__net-text">
                      <span className="org-network-rail-panel__rail-name">
                        {title}
                      </span>
                      {lamp ? <NetworkStatusLamp lamp={lamp} /> : null}
                    </div>
                  </div>

                  <div className="org-network-rail-panel__cell org-network-rail-panel__cell--confirm">
                    <div className="org-network-rail-panel__confirm-controls">
                      <NumberStepper
                        className="org-network-rail-panel__num-stepper"
                        inputClassName="org-network-rail-panel__num-input"
                        min={floor}
                        max={64}
                        step={1}
                        value={draftConfirms[row.network] ?? ""}
                        disabled={!canManage}
                        title={`Min ${floor} · max 64`}
                        aria-label={`${title} confirmations`}
                        onChange={(raw) =>
                          setDraftConfirms((d) => ({
                            ...d,
                            [row.network]: raw,
                          }))
                        }
                        onBlur={() =>
                          setDraftConfirms((d) => ({
                            ...d,
                            [row.network]: String(
                              clampConfirm(d[row.network] ?? "", floor),
                            ),
                          }))
                        }
                      />
                      {!inheritingConfirms ? (
                        <span className="org-network-rail-panel__badge is-override">
                          Override
                        </span>
                      ) : null}
                      <div className="org-network-rail-panel__slider-wrap">
                        <input
                          type="range"
                          min={floor}
                          max={64}
                          step={1}
                          className="org-network-rail-panel__slider"
                          value={confirmsVal}
                          disabled={!canManage}
                          aria-label={`${title} confirmations slider`}
                          style={
                            {
                              "--plat-slider-pct": sliderPct,
                            } as CSSProperties
                          }
                          onChange={(e) =>
                            setDraftConfirms((d) => ({
                              ...d,
                              [row.network]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="org-network-rail-panel__cell org-network-rail-panel__cell--mins">
                    <div className="org-network-rail-panel__min-grid">
                      {row.pairs.map((pair) => {
                        const key = pairKey(row.network, pair.asset);
                        const inheriting = pair.overrideMinAmount == null;
                        return (
                          <label
                            key={pair.asset}
                            className={`org-network-rail-panel__min${
                              inheriting ? "" : " is-override"
                            }`}
                            title={
                              inheriting
                                ? `${parentShort} default ${pair.parentFloorMinAmount}`
                                : `Override · floor ${pair.parentFloorMinAmount}`
                            }
                          >
                            <span className="org-network-rail-panel__min-asset">
                              <AssetIcon asset={pair.asset} />
                              {pair.asset}
                            </span>
                            <input
                              type="text"
                              inputMode="decimal"
                              className="org-network-rail-panel__min-input"
                              value={draftMin[key] ?? ""}
                              disabled={!canManage}
                              placeholder={pair.parentFloorMinAmount}
                              aria-label={`${pair.asset} min amount`}
                              onChange={(e) =>
                                setDraftMin((d) => ({
                                  ...d,
                                  [key]: e.target.value,
                                }))
                              }
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="org-network-rail-panel__cell org-network-rail-panel__cell--save">
                    {canManage ? (
                      <button
                        type="button"
                        className="org-network-rail-panel__save"
                        disabled={saving === row.network || !dirty}
                        onClick={() => void onSave(row.network)}
                      >
                        {saving === row.network ? "…" : "Save"}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
