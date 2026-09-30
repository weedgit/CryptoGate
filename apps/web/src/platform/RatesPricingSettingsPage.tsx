import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthToast } from "../auth/AuthToast";
import { NumberStepper } from "../ui/NumberStepper";
import { ChartHelpButton } from "./ui/ChartHelpButton";
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

function IconGear() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm9.4 3.1-1.7-.3a7.6 7.6 0 0 0-.6-1.5l1.1-1.3a.8.8 0 0 0-.1-1.1l-1.8-1.8a.8.8 0 0 0-1.1-.1l-1.3 1.1c-.5-.3-1-.5-1.5-.6l-.3-1.7a.8.8 0 0 0-.8-.6h-2.6a.8.8 0 0 0-.8.6l-.3 1.7c-.5.1-1 .3-1.5.6L6.8 4.9a.8.8 0 0 0-1.1.1L3.9 6.8a.8.8 0 0 0-.1 1.1l1.1 1.3c-.3.5-.5 1-.6 1.5l-1.7.3a.8.8 0 0 0-.6.8v2.6c0 .4.3.7.6.8l1.7.3c.1.5.3 1 .6 1.5l-1.1 1.3a.8.8 0 0 0 .1 1.1l1.8 1.8c.3.3.8.3 1.1.1l1.3-1.1c.5.3 1 .5 1.5.6l.3 1.7c.1.3.4.6.8.6h2.6c.4 0 .7-.3.8-.6l.3-1.7c.5-.1 1-.3 1.5-.6l1.3 1.1c.3.2.8.2 1.1-.1l1.8-1.8a.8.8 0 0 0 .1-1.1l-1.1-1.3c.3-.5.5-1 .6-1.5l1.7-.3a.8.8 0 0 0 .6-.8v-2.6a.8.8 0 0 0-.6-.8Z"
      />
    </svg>
  );
}

function IconSave() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.6 3.2H5.2A2.2 2.2 0 0 0 3 5.4v13.2A2.2 2.2 0 0 0 5.2 20.8h13.6a2.2 2.2 0 0 0 2.2-2.2V7.8l-3.4-4.6ZM12 18.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Zm3.4-10.8H6.4V5.2h9Z"
      />
    </svg>
  );
}

function IconPercent() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7.5 6.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm9 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM6.2 18.3a1 1 0 0 1 0-1.4l10.7-10.7a1 1 0 1 1 1.4 1.4L7.6 18.3a1 1 0 0 1-1.4 0Z"
      />
    </svg>
  );
}

function IconLink() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10.6 13.4a4 4 0 0 1 0-5.7l2.1-2.1a4 4 0 0 1 5.7 5.7l-1 1a1 1 0 1 1-1.4-1.4l1-1a2 2 0 1 0-2.8-2.8l-2.1 2.1a2 2 0 0 0 0 2.8 1 1 0 0 1-1.5 1.4Zm2.8-2.8a4 4 0 0 1 0 5.7l-2.1 2.1a4 4 0 1 1-5.7-5.7l1-1a1 1 0 0 1 1.4 1.4l-1 1a2 2 0 1 0 2.8 2.8l2.1-2.1a2 2 0 0 0 0-2.8 1 1 0 1 1 1.5-1.4Z"
      />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.2 4.5 5.3v5.4c0 5 3.4 9.5 7.5 10.9 4.1-1.4 7.5-5.9 7.5-10.9V5.3L12 2.2Zm0 2.2 5.5 2.3v3.9c0 3.8-2.5 7.3-5.5 8.6-3-1.3-5.5-4.8-5.5-8.6V6.7L12 4.4Z"
      />
    </svg>
  );
}

function IconCoins() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3c-3.9 0-7 1.3-7 3v2c0 1.7 3.1 3 7 3s7-1.3 7-3V6c0-1.7-3.1-3-7-3Zm0 10c-3.9 0-7-1.3-7-3v2c0 1.7 3.1 3 7 3s7-1.3 7-3v-2c0 1.7-3.1 3-7 3Zm0 5c-3.9 0-7-1.3-7-3v2c0 1.7 3.1 3 7 3s7-1.3 7-3v-2c0 1.7-3.1 3-7 3Z"
      />
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm-.8 3.5a1 1 0 0 1 1 1V12l3.2 1.9a1 1 0 1 1-1 1.7l-3.7-2.2A1 1 0 0 1 11 13V8.5a1 1 0 0 1 .2-.7Z"
      />
    </svg>
  );
}

function RatesIcon({ children }: { children: ReactNode }) {
  return <span className="plat-rates__icon">{children}</span>;
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
      setRateVenues(s.rateVenues?.length ? s.rateVenues : [...VENUE_OPTIONS]);
      setChainlinkReferenceEnabled(Boolean(s.chainlinkReferenceEnabled));
      setReferenceDeviationBps(s.referenceDeviationBps ?? 150);
      setSnapshot(
        snap({
          ratesEnabled: s.ratesEnabled,
          modePegged1to1Enabled: s.modePegged1to1Enabled,
          modeMarketEnabled: s.modeMarketEnabled,
          depegThresholdBps: s.depegThresholdBps,
          allowedQuoteLockSeconds:
            s.allowedQuoteLockSeconds ?? [...LOCK_OPTIONS],
          minRateSources: s.minRateSources ?? 2,
          rateVenues: s.rateVenues ?? [...VENUE_OPTIONS],
          chainlinkReferenceEnabled: Boolean(s.chainlinkReferenceEnabled),
          referenceDeviationBps: s.referenceDeviationBps ?? 150,
        }),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load pricing settings",
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
    if (minRateSources > rateVenues.filter((v) => v !== "binance").length) {
      setError(
        "Minimum sources is too high: Binance has no USDT/USD market, so USDT is priced by the other enabled venues only.",
      );
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
    return <PagePending title="Loading rates & pricing…" />;
  }

  return (
    <div className="plat-rates">
      <AuthToast
        message={error ?? okMsg}
        tone={error ? "error" : "ok"}
        onDismiss={() => {
          setError(null);
          setOkMsg(null);
        }}
      />

      <header className="plat-rates__head">
        <div className="plat-rates__head-main">
          <h1 className="plat-rates__title">Rates &amp; pricing</h1>
        </div>
        <p className="plat-rates__subtitle">
          Platform rate feed, venues, and merchant pricing modes.
        </p>
      </header>

      <form
        id="platform-pricing-form"
        className="plat-rates__stack"
        onSubmit={(e) => void onSave(e)}
      >
        {/* Platform controls */}
        <section className="plat-rates__panel">
          <div className="plat-rates__panel-top">
            <RatesIcon>
              <IconGear />
            </RatesIcon>
            <div className="plat-rates__panel-copy">
              <h2 className="plat-rates__panel-title">Platform controls</h2>
              <p className="plat-rates__panel-sub">
                Configure how merchant rates are sourced and applied across the
                platform.
              </p>
            </div>
          </div>

          <div className="plat-rates__toggle-grid">
            <label className="plat-rates__toggle">
              <input
                type="checkbox"
                checked={ratesEnabled}
                disabled={!canEdit}
                onChange={(e) => {
                  setRatesEnabled(e.target.checked);
                  setOkMsg(null);
                }}
              />
              <span className="plat-rates__toggle-body">
                <span className="plat-rates__toggle-label">
                  Rates enabled
                  <ChartHelpButton
                    openOnHover
                    label="Rates enabled help"
                    text="Master kill switch for the USD rate feed. When off, create-order and quotes return rates_unavailable, and open rate-priced orders expire immediately."
                  />
                </span>
                <span className="plat-rates__toggle-hint">
                  When off, new quotes fail and open rate-priced orders expire.
                </span>
              </span>
            </label>

            <label className="plat-rates__toggle">
              <input
                type="checkbox"
                checked={modeMarketEnabled}
                disabled={!canEdit}
                onChange={(e) => {
                  setModeMarketEnabled(e.target.checked);
                  setOkMsg(null);
                }}
              />
              <span className="plat-rates__toggle-body">
                <span className="plat-rates__toggle-label">
                  Always market mode
                  <ChartHelpButton
                    openOnHover
                    label="Always market mode help"
                    text="Allows merchants to force live multi-venue market rates instead of pegged pricing. Turning it off expires open market-priced orders."
                  />
                </span>
                <span className="plat-rates__toggle-hint">
                  Merchants may force live market rates.
                </span>
              </span>
            </label>

            <label className="plat-rates__toggle">
              <input
                type="checkbox"
                checked={modePegged1to1Enabled}
                disabled={!canEdit}
                onChange={(e) => {
                  setModePegged1to1Enabled(e.target.checked);
                  setOkMsg(null);
                }}
              />
              <span className="plat-rates__toggle-body">
                <span className="plat-rates__toggle-label">
                  Pegged 1:1 mode
                  <ChartHelpButton
                    openOnHover
                    label="Pegged 1:1 mode help"
                    text="Allows merchants to price stablecoins 1:1 until the depeg threshold is breached. Turning it off expires open pegged orders."
                  />
                </span>
                <span className="plat-rates__toggle-hint">
                  Merchants may select pegged stablecoin pricing.
                </span>
              </span>
            </label>

            <label className="plat-rates__toggle">
              <input
                type="checkbox"
                checked={chainlinkReferenceEnabled}
                disabled={!canEdit}
                onChange={(e) => {
                  setChainlinkReferenceEnabled(e.target.checked);
                  setOkMsg(null);
                }}
              />
              <span className="plat-rates__toggle-body">
                <span className="plat-rates__toggle-label">
                  Chainlink reference
                  <ChartHelpButton
                    openOnHover
                    label="Chainlink reference help"
                    text="When enabled, volatile asset quotes outside the Chainlink deviation band are rejected. Stablecoins warn instead of hard-fail."
                  />
                </span>
                <span className="plat-rates__toggle-hint">
                  Reject volatile quotes outside the deviation band (stables
                  warn).
                </span>
              </span>
            </label>
          </div>
        </section>

        {/* Depeg threshold */}
        <section className="plat-rates__panel plat-rates__panel--metric">
          <RatesIcon>
            <IconPercent />
          </RatesIcon>
          <div className="plat-rates__panel-copy">
            <h2 className="plat-rates__panel-title">
              Depeg threshold (basis points)
            </h2>
            <p className="plat-rates__panel-sub">
              Maximum allowed deviation from reference before switching to live
              rates.
            </p>
          </div>
          <NumberStepper
            id="depeg-bps"
            className="plat-rates__stepper"
            inputClassName="plat-rates__metric-input"
            min={0}
            max={5000}
            value={depegThresholdBps}
            disabled={!canEdit}
            aria-label="Depeg threshold basis points"
            onChange={(raw) => {
              const n = Number(raw);
              if (!Number.isFinite(n)) return;
              setDepegThresholdBps(Math.min(5000, Math.max(0, Math.trunc(n))));
              setOkMsg(null);
            }}
          />
          <aside className="plat-rates__info">
            <strong>Default: 100 – 1%</strong>
            <span>Pegged stables switch to live rate beyond this band.</span>
          </aside>
        </section>

        {/* Min venues */}
        <section className="plat-rates__panel plat-rates__panel--metric">
          <RatesIcon>
            <IconLink />
          </RatesIcon>
          <div className="plat-rates__panel-copy">
            <h2 className="plat-rates__panel-title">Minimum healthy venues</h2>
            <p className="plat-rates__panel-sub">
              Minimum number of healthy venues required for rate calculation.
            </p>
          </div>
          <NumberStepper
            id="min-sources"
            className="plat-rates__stepper"
            inputClassName="plat-rates__metric-input"
            min={1}
            max={5}
            value={minRateSources}
            disabled={!canEdit}
            aria-label="Minimum healthy venues"
            onChange={(raw) => {
              const n = Number(raw);
              if (!Number.isFinite(n)) return;
              setMinRateSources(Math.min(5, Math.max(1, Math.trunc(n))));
              setOkMsg(null);
            }}
          />
          <aside className="plat-rates__info">
            <span>
              Fail closed with rates_unavailable when fewer venues succeed.
              Default: 2.
            </span>
          </aside>
        </section>

        {/* Chainlink band */}
        <section className="plat-rates__panel plat-rates__panel--metric">
          <RatesIcon>
            <IconShield />
          </RatesIcon>
          <div className="plat-rates__panel-copy">
            <h2 className="plat-rates__panel-title">
              Chainlink deviation band (basis points)
            </h2>
            <p className="plat-rates__panel-sub">
              Allowed deviation from Chainlink reference price.
            </p>
          </div>
          <NumberStepper
            id="ref-bps"
            className="plat-rates__stepper"
            inputClassName="plat-rates__metric-input"
            min={0}
            max={5000}
            value={referenceDeviationBps}
            disabled={!canEdit || !chainlinkReferenceEnabled}
            aria-label="Chainlink deviation band basis points"
            onChange={(raw) => {
              const n = Number(raw);
              if (!Number.isFinite(n)) return;
              setReferenceDeviationBps(
                Math.min(5000, Math.max(0, Math.trunc(n))),
              );
              setOkMsg(null);
            }}
          />
          <aside className="plat-rates__info">
            <strong>Default: 150 – 1.5%</strong>
          </aside>
        </section>

        {/* Venues */}
        <section className="plat-rates__panel plat-rates__panel--list">
          <RatesIcon>
            <IconCoins />
          </RatesIcon>
          <div className="plat-rates__panel-copy">
            <h2 className="plat-rates__panel-title">Rate venues (median)</h2>
            <p className="plat-rates__panel-sub">
              Select venues to include in median rate calculation.
            </p>
          </div>
          <div className="plat-rates__checks-bar">
            {VENUE_OPTIONS.map((v) => {
              const on = rateVenues.includes(v);
              const locked = on && rateVenues.length === 1;
              return (
                <label key={v} className="plat-rates__bar-check">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!canEdit || locked}
                    onChange={(e) => toggleVenue(v, e.target.checked)}
                  />
                  <span>{v}</span>
                </label>
              );
            })}
          </div>
        </section>

        {/* Lock durations */}
        <section className="plat-rates__panel plat-rates__panel--list">
          <RatesIcon>
            <IconClock />
          </RatesIcon>
          <div className="plat-rates__panel-copy">
            <h2 className="plat-rates__panel-title">
              Allowed quote lock durations
            </h2>
            <p className="plat-rates__panel-sub">
              Which quote lock durations are available for merchants.
            </p>
          </div>
          <div className="plat-rates__checks-bar">
            {LOCK_OPTIONS.map((s) => {
              const on = allowedQuoteLockSeconds.includes(s);
              const locked = on && allowedQuoteLockSeconds.length === 1;
              return (
                <label key={s} className="plat-rates__bar-check">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!canEdit || locked}
                    onChange={(e) => toggleLock(s, e.target.checked)}
                  />
                  <span>{lockLabel(s)}</span>
                </label>
              );
            })}
          </div>
        </section>

        {canEdit ? (
          <div className="plat-rates__actions">
            <button
              type="submit"
              className="plat-rates__save"
              disabled={saving || !dirty}
            >
              <IconSave />
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
