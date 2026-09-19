import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  getMerchantPricingSettings,
  getPlatformPricingSettings,
  putMerchantPricingSettings,
  type Session,
} from "./api";
import { AuthToast } from "../auth/AuthToast";
import {
  primaryMerchantOrgId,
  sessionCanEditOrgSettings,
} from "./org";

type Props = { session: Session };

const MODE_OPTIONS = [
  {
    id: "pegged_1to1",
    label: "Pegged 1:1",
    blurb:
      "Stablecoins settle at $1.00 when the market rate stays within the platform depeg band; otherwise the live rate is used.",
  },
  {
    id: "market",
    label: "Always market",
    blurb: "Every asset uses the live USD rate from the rate feed at quote time.",
  },
] as const;

function lockLabel(seconds: number): string {
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds}s`;
}

/** Merchant FX pricing mode + quote lock (Phase 1 USD invoices). */
export function PricingSettingsPage({ session }: Props) {
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const canEdit = sessionCanEditOrgSettings(session);
  const [pricingMode, setPricingMode] = useState("pegged_1to1");
  const [quoteLockSeconds, setQuoteLockSeconds] = useState(900);
  const [allowedLocks, setAllowedLocks] = useState<number[]>([300, 600, 900, 1800]);
  const [peggedEnabled, setPeggedEnabled] = useState(true);
  const [marketEnabled, setMarketEnabled] = useState(true);
  const [ratesEnabled, setRatesEnabled] = useState(true);
  const [modeAvailable, setModeAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedMode, setSavedMode] = useState("pegged_1to1");
  const [savedLock, setSavedLock] = useState(900);

  const load = useCallback(async () => {
    if (!orgId) {
      setError("No merchant organization is available for this account.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [merchant, platform] = await Promise.all([
        getMerchantPricingSettings(orgId),
        getPlatformPricingSettings().catch(() => null),
      ]);
      setPricingMode(merchant.pricingMode);
      setQuoteLockSeconds(merchant.quoteLockSeconds);
      setSavedMode(merchant.pricingMode);
      setSavedLock(merchant.quoteLockSeconds);
      setModeAvailable(merchant.effective?.modeAvailable ?? true);
      setRatesEnabled(merchant.effective?.ratesEnabled ?? true);
      if (platform) {
        setPeggedEnabled(platform.modePegged1to1Enabled);
        setMarketEnabled(platform.modeMarketEnabled);
        setRatesEnabled(platform.ratesEnabled);
        setAllowedLocks(
          platform.allowedQuoteLockSeconds?.length
            ? platform.allowedQuoteLockSeconds
            : [300, 600, 900, 1800],
        );
      }
      setDirty(false);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load pricing settings",
      );
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectMode(next: string) {
    if (!canEdit) return;
    if (next === "pegged_1to1" && !peggedEnabled) return;
    if (next === "market" && !marketEnabled) return;
    setPricingMode(next);
    setDirty(next !== savedMode || quoteLockSeconds !== savedLock);
    setOkMsg(null);
  }

  function selectLock(next: number) {
    if (!canEdit) return;
    setQuoteLockSeconds(next);
    setDirty(pricingMode !== savedMode || next !== savedLock);
    setOkMsg(null);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !canEdit || !dirty) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const saved = (await putMerchantPricingSettings(orgId, {
        pricingMode,
        quoteLockSeconds,
      })) as {
        pricingMode: string;
        quoteLockSeconds: number;
        effective?: { modeAvailable: boolean; ratesEnabled: boolean };
      };
      setPricingMode(saved.pricingMode);
      setQuoteLockSeconds(saved.quoteLockSeconds);
      setSavedMode(saved.pricingMode);
      setSavedLock(saved.quoteLockSeconds);
      setModeAvailable(saved.effective?.modeAvailable ?? true);
      setRatesEnabled(saved.effective?.ratesEnabled ?? ratesEnabled);
      setDirty(false);
      setOkMsg("Pricing settings saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="plat-settings plat-settings--merchant">
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
            <h1 className="plat-alerts__name">Pricing</h1>
            {!canEdit ? (
              <span className="plat-alerts__chip plat-alerts__chip--muted">
                Viewer · read-only
              </span>
            ) : null}
          </div>
          <p className="muted">
            Invoices are priced in USD. Customers pick an asset; the platform locks a
            token amount for the quote window you choose.
          </p>
        </div>
      </header>

      <section className="plat-settings__card">
        <div className="plat-settings__card-head">
          <h2 className="plat-settings__card-title">FX pricing mode</h2>
          {canEdit ? (
            <button
              type="submit"
              form="merchant-pricing-form"
              className="btn-primary btn-inline btn-tiny"
              disabled={saving || !dirty || loading}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          ) : null}
        </div>
        <div className="plat-settings__card-body">
          {loading ? (
            <p className="muted">Loading pricing settings…</p>
          ) : (
            <form id="merchant-pricing-form" onSubmit={(e) => void onSave(e)}>
              {!ratesEnabled ? (
                <p className="plat-settings__card-note" role="status">
                  Rate service is temporarily disabled by the platform. Existing
                  preferences are preserved.
                </p>
              ) : null}
              {!modeAvailable ? (
                <p className="plat-settings__card-note" role="status">
                  Your saved pricing mode is currently unavailable. Prefer another
                  enabled mode, or wait until the platform re-enables it.
                </p>
              ) : null}

              <div
                className="plat-settlement__stats plat-settlement__stats--pick plat-settlement__stats--duo"
                role="radiogroup"
                aria-label="Pricing mode"
              >
                {MODE_OPTIONS.map((opt) => {
                  const disabled =
                    !canEdit ||
                    (opt.id === "pegged_1to1" && !peggedEnabled) ||
                    (opt.id === "market" && !marketEnabled);
                  const selected = pricingMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={disabled}
                      className={`plat-settlement__stat plat-settlement__stat-pick${
                        selected ? " is-selected" : ""
                      }${disabled ? " is-disabled" : ""}`}
                      onClick={() => selectMode(opt.id)}
                    >
                      <span className="plat-settlement__stat-label">
                        {opt.label}
                        {selected ? (
                          <span className="plat-settlement__stat-selected-tag">
                            Selected
                          </span>
                        ) : null}
                      </span>
                      <strong className="plat-settlement__stat-value">
                        {opt.id === "pegged_1to1" ? "1:1" : "FX"}
                      </strong>
                      <span className="plat-settlement__stat-hint">
                        {opt.blurb}
                        {opt.id === "pegged_1to1" && !peggedEnabled
                          ? " (disabled by platform)"
                          : ""}
                        {opt.id === "market" && !marketEnabled
                          ? " (disabled by platform)"
                          : ""}
                      </span>
                    </button>
                  );
                })}
              </div>

              <label className="plat-settings__field" htmlFor="quote-lock">
                <span>Quote lock</span>
                <select
                  id="quote-lock"
                  className="plat-settings__input"
                  value={quoteLockSeconds}
                  disabled={!canEdit}
                  onChange={(e) => selectLock(Number(e.target.value))}
                >
                  {allowedLocks.map((s) => (
                    <option key={s} value={s}>
                      {lockLabel(s)}
                    </option>
                  ))}
                </select>
                <span className="muted">
                  Rate is locked for this window when a pay method is quoted.
                </span>
              </label>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
