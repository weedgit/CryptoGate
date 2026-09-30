import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { AssetIcon, NetworkIcon } from "../platform/cryptoIcons";
import { NetworkStatusLamp } from "../shared/NetworkStatusLamp";
import { networkShortLabel } from "../shared/assetNetworks";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  getMerchantNetworkRails,
  putMerchantNetworkRailSettings,
  type MerchantNetworkRailItem,
  type Session,
} from "./api";
import {
  primaryMerchantOrgId,
  sessionCanEditOrgSettings,
} from "./org";
import { PlatformPending } from "../platform/ui/PlatformPending";
import { NumberStepper } from "../ui/NumberStepper";
import { IntegrationsPage } from "./IntegrationsPage";
import { usePageRefresh } from "../shared/pageRefresh";

type Props = { session: Session };

function clampConfirm(raw: string, floor: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return floor;
  return Math.min(64, Math.max(floor, Math.round(n)));
}

/** Merchant Networks tab: rail settings, then API keys and webhooks. */
export function NetworksPage({ session }: Props) {
  return (
    <div className="merchant-networks-page">
      <NetworkRailsPanel session={session} />
      <IntegrationsPage session={session} />
    </div>
  );
}

/** Orderability + stricter confirmation overrides (platform floor). */
function NetworkRailsPanel({ session }: Props) {
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const canEdit = useMemo(
    () => (orgId ? sessionCanEditOrgSettings(session) : false),
    [orgId, session],
  );
  const [items, setItems] = useState<MerchantNetworkRailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getMerchantNetworkRails(orgId);
      setItems(data.items);
      const next: Record<string, string> = {};
      for (const row of data.items) {
        next[row.network] = String(row.effectiveConfirmations);
      }
      setDraft(next);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load networks",
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);
  usePageRefresh(load);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(network: string) {
    if (!orgId || !canEdit || saving) return;
    const row = items.find((r) => r.network === network);
    if (!row) return;
    const raw = (draft[network] ?? "").trim();
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 64) {
      setError("Confirmations must be an integer from 1 to 64");
      return;
    }
    if (n < row.platformFloorConfirmations) {
      setError(
        `Confirmations must be at least the platform floor (${row.platformFloorConfirmations})`,
      );
      return;
    }

    const body =
      n === row.platformFloorConfirmations
        ? { requiredConfirmations: null as number | null }
        : { requiredConfirmations: n as number | null };

    if (
      body.requiredConfirmations === null &&
      row.merchantConfirmations == null
    ) {
      return;
    }
    if (body.requiredConfirmations === row.merchantConfirmations) {
      return;
    }

    setSaving(network);
    setError(null);
    try {
      const result = await putMerchantNetworkRailSettings(orgId, network, body);
      setItems((prev) =>
        prev.map((r) =>
          r.network === network
            ? {
                ...r,
                platformFloorConfirmations: result.platformFloorConfirmations,
                merchantConfirmations: result.merchantConfirmations,
                effectiveConfirmations: result.effectiveConfirmations,
                pairs: r.pairs.map((p) => ({
                  ...p,
                  effectiveConfirmations: result.effectiveConfirmations,
                })),
              }
            : r,
        ),
      );
      setDraft((d) => ({
        ...d,
        [network]: String(result.effectiveConfirmations),
      }));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save confirmations",
      );
    } finally {
      setSaving(null);
    }
  }

  if (!orgId) {
    return (
      <div className="org-network-rail-panel org-network-rail-panel--table">
        <p className="org-network-rail-panel__empty-copy">
          No merchant organization on this session.
        </p>
      </div>
    );
  }

  return (
    <div className="org-network-rail-panel org-network-rail-panel--table">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      <header className="org-network-rail-panel__intro org-network-rail-panel__intro--page">
        <span className="org-network-rail-panel__intro-icon" aria-hidden>
          <svg
            viewBox="0 0 24 24"
            width="36"
            height="36"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="5" r="2.5" />
            <circle cx="5" cy="18" r="2.5" />
            <circle cx="19" cy="18" r="2.5" />
            <path d="M10.8 7.2 6.2 15.8M13.2 7.2l4.6 8.6M7.5 18h9" />
          </svg>
        </span>
        <div className="org-network-rail-panel__intro-main">
          <div className="org-network-rail-panel__intro-title-row">
            <h1 className="org-network-rail-panel__intro-title">Networks</h1>
          </div>
          <p className="org-network-rail-panel__intro-sub">
            Platform sets the confirmation floor. You may require more for new
            orders — never less.
          </p>
        </div>
        <span className="org-network-rail-panel__count">
          {loading
            ? "…"
            : `${items.length} network${items.length === 1 ? "" : "s"}`}
        </span>
      </header>

      {loading ? (
        <div className="org-network-rail-panel__pending">
          <PlatformPending
            compact
            title="Loading rails"
            copy="Fetching network settings for your account."
          />
        </div>
      ) : null}

      {!loading && items.length === 0 ? (
        <div className="org-network-rail-panel__empty" role="status">
          <p className="org-network-rail-panel__empty-title">No networks available</p>
          <p className="org-network-rail-panel__empty-copy">
            PaymentGate has not enabled any networks for this environment yet.
          </p>
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="org-network-rail-panel__table-shell">
          <div className="org-network-rail-panel__cols" aria-hidden="true">
            <span>Network</span>
            <span>Confirmations</span>
            <span>Min amounts</span>
            <span />
          </div>

          <div className="org-network-rail-panel__table">
            {items.map((row, index) => {
              const floor = row.platformFloorConfirmations;
              const confirmsVal = clampConfirm(
                draft[row.network] ?? String(floor),
                floor,
              );
              const dirty =
                (draft[row.network] ?? "") !==
                String(row.effectiveConfirmations);
              const title = row.title || networkShortLabel(row.network);
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
                      <NetworkStatusLamp lamp={row.lamp} />
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
                        value={draft[row.network] ?? ""}
                        disabled={!canEdit}
                        title={`Platform floor ${floor} · max 64`}
                        aria-label={`${title} confirmations`}
                        onChange={(raw) =>
                          setDraft((d) => ({ ...d, [row.network]: raw }))
                        }
                        onBlur={() =>
                          setDraft((d) => ({
                            ...d,
                            [row.network]: String(
                              clampConfirm(d[row.network] ?? "", floor),
                            ),
                          }))
                        }
                      />
                      {row.merchantConfirmations != null ? (
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
                          disabled={!canEdit}
                          aria-label={`${title} confirmations slider`}
                          style={
                            {
                              "--plat-slider-pct": sliderPct,
                            } as CSSProperties
                          }
                          onChange={(e) =>
                            setDraft((d) => ({
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
                      {row.pairs.map((pair) => (
                        <label
                          key={pair.asset}
                          className="org-network-rail-panel__min"
                          title="Set by PaymentGate platform"
                        >
                          <span className="org-network-rail-panel__min-asset">
                            <AssetIcon asset={pair.asset} />
                            {pair.asset}
                          </span>
                          <input
                            type="text"
                            className="org-network-rail-panel__min-input"
                            value={pair.minAmount}
                            readOnly
                            disabled
                            aria-label={`${pair.asset} min amount`}
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="org-network-rail-panel__cell org-network-rail-panel__cell--save">
                    {canEdit ? (
                      <button
                        type="button"
                        className="org-network-rail-panel__save"
                        disabled={saving === row.network || !dirty}
                        title="Applies to new orders only"
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
