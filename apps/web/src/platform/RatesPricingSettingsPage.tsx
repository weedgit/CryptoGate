import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  getPlatformPricingSettings,
  putPlatformPricingSettings,
  type Session,
} from "../merchant/api";
import { sessionIsPlatformOwner } from "./org";
import { PagePending } from "./ui/PlatformPending";

type Props = { session: Session };

const LOCK_OPTIONS = [300, 600, 900, 1800] as const;
const VENUE_OPTIONS = ["binance", "coingecko", "kraken"] as const;

function lockLabel(seconds: number): string {
  return `${seconds / 60} min`;
}

type SnapshotShape = {
  ratesEnabled: boolean;
  modePegged1to1Enabled: boolean;
  modeMarketEnabled: boolean;
  depegThresholdBps: number;
  allowedQuoteLockSeconds: number[];
  minRateSources: number;
  rateVenues: string[];
  chainlinkReferenceEnabled: boolean;
  referenceDeviationBps: number;
};

function snap(s: SnapshotShape): string {
  return JSON.stringify({
    ...s,
    allowedQuoteLockSeconds: [...s.allowedQuoteLockSeconds].sort((a, b) => a - b),
    rateVenues: [...s.rateVenues].sort(),
  });
}

/** Platform kill switches for USD rate feed, median venues, and Chainlink. */
export function RatesPricingSettingsPage({ session }: Props) {
  const canEdit = useMemo(() => sessionIsPlatformOwner(session), [session]);
  const [ratesEnabled, setRatesEnabled] = useState(true);
  const [modePegged1to1Enabled, setModePegged1to1Enabled] = useState(true);
  const [modeMarketEnabled, setModeMarketEnabled] = useState(true);
  const [depegThresholdBps, setDepegThresholdBps] = useState(100);
  const [allowedQuoteLockSeconds, setAllowedQuoteLockSeconds] = useState<
    number[]
  >([...LOCK_OPTIONS]);
  const [minRateSources, setMinRateSources] = useState(2);
  const [rateVenues, setRateVenues] = useState<string[]>([...VENUE_OPTIONS]);
  const [chainlinkReferenceEnabled, setChainlinkReferenceEnabled] =
    useState(false);
  const [referenceDeviationBps, setReferenceDeviationBps] = useState(150);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState("");

  const current: SnapshotShape = {
    ratesEnabled,
    modePegged1to1Enabled,
    modeMarketEnabled,
    depegThresholdBps,
    allowedQuoteLockSeconds,
    minRateSources,
    rateVenues,
    chainlinkReferenceEnabled,
    referenceDeviationBps,
  };
  const dirty = snap(current) !== snapshot;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getPlatformPricingSettings();
      setRatesEnabled(s.ratesEnabled);
      setModePegged1to1Enabled(s.modePegged1to1Enabled);
      setModeMarketEnabled(s.modeMarketEnabled);
      setDepegThresholdBps(s.depegThresholdBps);
      setAllowedQuoteLockSeconds(
        s.allowedQuoteLockSeconds?.length
          ? s.allowedQuoteLockSeconds
          : [...LOCK_OPTIONS],
      );
      setMinRateSources(s.minRateSources ?? 2);
      setRateVenues(
        s.rateVenues?.length ? s.rateVenues : [...VENUE_OPTIONS],
      );
      setChainlinkReferenceEnabled(Boolean(s.chainlinkReferenceEnabled));
      setReferenceDeviationBps(s.referenceDeviationBps ?? 150);
      setSnapshot(
        snap({
          ratesEnabled: s.ratesEnabled,
          modePegged1to1Enabled: s.modePegged1to1Enabled,
          modeMarketEnabled: s.modeMarketEnabled,
          depegThresholdBps: s.depegThresholdBps,
          allowedQuoteLockSeconds: s.allowedQuoteLockSeconds ?? [...LOCK_OPTIONS],
          minRateSources: s.minRateSources ?? 2,
          rateVenues: s.rateVenues ?? [...VENUE_OPTIONS],
          chainlinkReferenceEnabled: Boolean(s.chainlinkReferenceEnabled),
          referenceDeviationBps: s.referenceDeviationBps ?? 150,
        }),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load pricing settings",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleLock(seconds: number, on: boolean) {
    if (!canEdit) return;
    setAllowedQuoteLockSeconds((prev) => {
      if (on) {
        return prev.includes(seconds)
          ? prev
          : [...prev, seconds].sort((a, b) => a - b);
      }
      if (prev.length <= 1) return prev;
      return prev.filter((s) => s !== seconds);
    });
    setOkMsg(null);
  }

  function toggleVenue(venue: string, on: boolean) {
    if (!canEdit) return;
    setRateVenues((prev) => {
      if (on) {
        return prev.includes(venue) ? prev : [...prev, venue];
      }
      if (prev.length <= 1) return prev;
      return prev.filter((v) => v !== venue);
    });
    setOkMsg(null);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!canEdit || !dirty) return;
    if (allowedQuoteLockSeconds.length === 0) {
      setError("At least one quote lock duration must stay enabled.");
      return;
    }
    if (rateVenues.length === 0) {
      setError("At least one rate venue must stay enabled.");
      return;
    }
    if (minRateSources > rateVenues.length) {
      setError("Minimum sources cannot exceed enabled venues.");
      return;
    }
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const saved = (await putPlatformPricingSettings({
        ratesEnabled,
        modePegged1to1Enabled,
        modeMarketEnabled,
        depegThresholdBps,
        allowedQuoteLockSeconds,
        minRateSources,
        rateVenues,
        chainlinkReferenceEnabled,
        referenceDeviationBps,
      })) as SnapshotShape;
      setRatesEnabled(saved.ratesEnabled);
      setModePegged1to1Enabled(saved.modePegged1to1Enabled);
      setModeMarketEnabled(saved.modeMarketEnabled);
      setDepegThresholdBps(saved.depegThresholdBps);
      setAllowedQuoteLockSeconds(saved.allowedQuoteLockSeconds);
      setMinRateSources(saved.minRateSources);
      setRateVenues(saved.rateVenues);
      setChainlinkReferenceEnabled(saved.chainlinkReferenceEnabled);
      setReferenceDeviationBps(saved.referenceDeviationBps);
      setSnapshot(snap(saved));
      setOkMsg("Platform pricing settings saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <PagePending label="Loading rates & pricing…" />;
  }

  return (
    <div className="plat-settings">
      <AuthToast
        message={error ?? okMsg}
        tone={error ? "error" : "ok"}
        onDismiss={() => {
          setError(null);
          setOkMsg(null);
        }}
      />

      <header className="plat-alerts__hero">
        <div className="plat-alerts__hero-main">
          <div className="plat-alerts__title-row">
            <h1 className="plat-alerts__name">Rates &amp; pricing</h1>
            {!canEdit ? (
              <span className="plat-alerts__chip plat-alerts__chip--muted">
                Viewer · read-only
              </span>
            ) : null}
          </div>
          <p className="muted">
            Multi-venue median USD feed, Chainlink reference band, and merchant
            pricing kill switches. Merchant preferences are preserved when a mode
            is disabled.
          </p>
        </div>
      </header>

      <section className="plat-settings__card">
        <div className="plat-settings__card-head">
          <h2 className="plat-settings__card-title">Platform controls</h2>
          {canEdit ? (
            <button
              type="submit"
              form="platform-pricing-form"
              className="btn-primary btn-inline btn-tiny"
              disabled={saving || !dirty}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          ) : null}
        </div>
        <div className="plat-settings__card-body">
          <form id="platform-pricing-form" onSubmit={(e) => void onSave(e)}>
            <ul className="plat-settings__pref-list">
              <li>
                <label>
                  <input
                    type="checkbox"
                    checked={ratesEnabled}
                    disabled={!canEdit}
                    onChange={(e) => {
                      setRatesEnabled(e.target.checked);
                      setOkMsg(null);
                    }}
                  />
                  Rates enabled — when off, new quotes fail with rates_unavailable
                </label>
              </li>
              <li>
                <label>
                  <input
                    type="checkbox"
                    checked={modePegged1to1Enabled}
                    disabled={!canEdit}
                    onChange={(e) => {
                      setModePegged1to1Enabled(e.target.checked);
                      setOkMsg(null);
                    }}
                  />
                  Pegged 1:1 mode — merchants may select pegged stablecoin pricing
                </label>
              </li>
              <li>
                <label>
                  <input
                    type="checkbox"
                    checked={modeMarketEnabled}
                    disabled={!canEdit}
                    onChange={(e) => {
                      setModeMarketEnabled(e.target.checked);
                      setOkMsg(null);
                    }}
                  />
                  Always market mode — merchants may force live market rates
                </label>
              </li>
              <li>
                <label>
                  <input
                    type="checkbox"
                    checked={chainlinkReferenceEnabled}
                    disabled={!canEdit}
                    onChange={(e) => {
                      setChainlinkReferenceEnabled(e.target.checked);
                      setOkMsg(null);
                    }}
                  />
                  Chainlink reference — reject volatile quotes outside the
                  deviation band (stables warn)
                </label>
              </li>
            </ul>

            <label className="plat-settings__field" htmlFor="depeg-bps">
              <span>Depeg threshold (basis points)</span>
              <input
                id="depeg-bps"
                className="plat-settings__input"
                type="number"
                min={0}
                max={5000}
                step={1}
                value={depegThresholdBps}
                disabled={!canEdit}
                onChange={(e) => {
                  setDepegThresholdBps(Number(e.target.value));
                  setOkMsg(null);
                }}
              />
              <span className="muted">
                Default 100 = 1%. Pegged stables switch to live rate beyond this
                band.
              </span>
            </label>

            <label className="plat-settings__field" htmlFor="min-sources">
              <span>Minimum healthy venues</span>
              <input
                id="min-sources"
                className="plat-settings__input"
                type="number"
                min={1}
                max={5}
                step={1}
                value={minRateSources}
                disabled={!canEdit}
                onChange={(e) => {
                  setMinRateSources(Number(e.target.value));
                  setOkMsg(null);
                }}
              />
              <span className="muted">
                Fail closed with rates_unavailable when fewer venues succeed.
                Default 2.
              </span>
            </label>

            <label className="plat-settings__field" htmlFor="ref-bps">
              <span>Chainlink deviation band (basis points)</span>
              <input
                id="ref-bps"
                className="plat-settings__input"
                type="number"
                min={0}
                max={5000}
                step={1}
                value={referenceDeviationBps}
                disabled={!canEdit || !chainlinkReferenceEnabled}
                onChange={(e) => {
                  setReferenceDeviationBps(Number(e.target.value));
                  setOkMsg(null);
                }}
              />
              <span className="muted">Default 150 = 1.5%.</span>
            </label>

            <fieldset className="plat-settings__field">
              <legend>Rate venues (median)</legend>
              <ul className="plat-settings__pref-list">
                {VENUE_OPTIONS.map((v) => (
                  <li key={v}>
                    <label>
                      <input
                        type="checkbox"
                        checked={rateVenues.includes(v)}
                        disabled={
                          !canEdit ||
                          (rateVenues.length === 1 && rateVenues.includes(v))
                        }
                        onChange={(e) => toggleVenue(v, e.target.checked)}
                      />
                      {v}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>

            <fieldset className="plat-settings__field">
              <legend>Allowed quote lock durations</legend>
              <ul className="plat-settings__pref-list">
                {LOCK_OPTIONS.map((s) => (
                  <li key={s}>
                    <label>
                      <input
                        type="checkbox"
                        checked={allowedQuoteLockSeconds.includes(s)}
                        disabled={
                          !canEdit ||
                          (allowedQuoteLockSeconds.length === 1 &&
                            allowedQuoteLockSeconds.includes(s))
                        }
                        onChange={(e) => toggleLock(s, e.target.checked)}
                      />
                      {lockLabel(s)}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          </form>
        </div>
      </section>
    </div>
  );
}
