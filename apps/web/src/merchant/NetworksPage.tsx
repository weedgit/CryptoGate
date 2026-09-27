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
import { PagePending } from "../platform/ui/PlatformPending";

type Props = { session: Session };

/** Merchant view: orderability + stricter confirmation overrides (platform floor). */
export function NetworksPage({ session }: Props) {
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
      <div className="merchant-networks">
        <p className="muted">No merchant organization on this session.</p>
      </div>
    );
  }

  return (
    <div className="merchant-networks">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <section className="merchant-networks__card">
        <header className="merchant-networks__card-head">
          <div>
            <h2 className="merchant-networks__card-title">Networks</h2>
            <p className="merchant-networks__lede">
              Platform sets the confirmation floor. You may require more for new
              orders — never less.
            </p>
          </div>
          <span className="merchant-networks__card-pill">
            {items.length} network{items.length === 1 ? "" : "s"}
          </span>
        </header>

        {loading ? <PagePending /> : null}

        {!loading && items.length === 0 ? (
          <p className="muted">No networks available for this environment.</p>
        ) : null}

        {!loading && items.length > 0 ? (
          <div className="merchant-networks__rails">
            {items.map((row) => {
              const dirty =
                (draft[row.network] ?? "") !==
                String(row.effectiveConfirmations);
              return (
                <article key={row.network} className="merchant-networks__rail">
                  <div className="merchant-networks__rail-head">
                    <div className="merchant-networks__rail-id">
                      <NetworkIcon network={row.network} />
                      <div>
                        <h3>{row.title || networkShortLabel(row.network)}</h3>
                        <div className="merchant-networks__rail-assets">
                          {row.pairs.map((p) => (
                            <span key={p.asset}>
                              <AssetIcon asset={p.asset} />
                              {p.asset}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <NetworkStatusLamp lamp={row.lamp} />
                  </div>

                  <div className="merchant-networks__rail-meta">
                    <div>
                      <span className="merchant-networks__rail-label">
                        Platform floor
                      </span>
                      <strong>{row.platformFloorConfirmations}</strong>
                    </div>
                    <div>
                      <span className="merchant-networks__rail-label">
                        Min amount
                      </span>
                      <strong>
                        {row.minAmount != null && row.primaryAsset
                          ? `${row.minAmount} ${row.primaryAsset}`
                          : "—"}
                      </strong>
                    </div>
                    <label className="merchant-networks__rail-field">
                      <span className="merchant-networks__rail-label merchant-networks__rail-label--row">
                        Your confirmations
                        <strong className="merchant-networks__rail-confirm-value">
                          {draft[row.network] || "—"}
                        </strong>
                      </span>
                      <input
                        type="range"
                        min={row.platformFloorConfirmations}
                        max={64}
                        step={1}
                        className="merchant-networks__rail-slider"
                        value={Number(draft[row.network]) || row.platformFloorConfirmations}
                        disabled={!canEdit}
                        aria-label={`${row.title} confirmations`}
                        style={
                          {
                            "--plat-slider-pct": (() => {
                              const lo = row.platformFloorConfirmations;
                              const hi = 64;
                              const cur = Math.min(
                                hi,
                                Math.max(lo, Number(draft[row.network]) || lo),
                              );
                              const span = Math.max(1, hi - lo);
                              return `${((cur - lo) / span) * 100}%`;
                            })(),
                          } as CSSProperties
                        }
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            [row.network]: e.target.value,
                          }))
                        }
                      />
                      <div className="merchant-networks__rail-slider-ends" aria-hidden="true">
                        <span>{row.platformFloorConfirmations}</span>
                        <span>64</span>
                      </div>
                    </label>
                  </div>

                  {canEdit && dirty ? (
                    <div className="merchant-networks__rail-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={saving === row.network}
                        onClick={() => void onSave(row.network)}
                      >
                        {saving === row.network ? "Saving…" : "Save"}
                      </button>
                      <span className="muted">Applies to new orders only</span>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
