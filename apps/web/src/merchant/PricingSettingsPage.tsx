import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  getMerchantPricingSettings,
  getPlatformPricingSettings,
  putMerchantPricingSettings,
  type Session,
} from "./api";
import { AuthToast } from "../auth/AuthToast";
import { SettlementSectionHead } from "./SettlementSectionHead";
import { SettlementOptionGroup } from "./settlement/SettlementOptionGroup";
import {
  primaryMerchantOrgId,
  sessionCanEditOrgSettings,
} from "./org";

type Props = { session: Session };

const MODE_OPTIONS = [
  {
    id: "pegged_1to1",
    label: "Pegged 1:1",
    value: "1:1",
    blurb:
      "Stablecoins settle at $1.00 when the market rate stays within the platform depeg band; otherwise the live rate is used.",
  },
  {
    id: "market",
    label: "Always market",
    value: "FX",
    blurb: "Every asset uses the live USD rate from the rate feed at quote time.",
  },
  {
    id: "usd_to_token",
    label: "USD to token",
    value: "USD",
    blurb:
      "Enter the USD amount. PaymentGate converts it to the token amount at the cached fund rate.",
  },
  {
    id: "token_to_usd",
    label: "Token amount to USD",
    value: "USD",
    blurb:
      "Enter the token amount. PaymentGate converts it to USD at the live rate.",
  },
] as const;

function lockLabel(seconds: number): string {
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds}s`;
}

/** Merchant FX pricing mode + quote lock card (Settlement tab). */
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

  function modeEnabled(id: string): boolean {
    return id === "pegged_1to1" ? peggedEnabled : marketEnabled;
  }

  function selectMode(next: string) {
    if (!canEdit || !modeEnabled(next)) return;
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

  const toast = (
    <AuthToast
      message={error ?? okMsg}
      tone={error ? "error" : "ok"}
      onDismiss={() => {
        setError(null);
        setOkMsg(null);
      }}
    />
  );

  const card = (
      <section className="plat-settings__card plat-settlement__card plat-settlement__card--pricing">
        <SettlementSectionHead
          icon="fx"
          title="FX pricing mode"
          subtitle="How invoice amounts convert between USD and tokens."
        >
          <span className={`plat-settlement__mode-pill${dirty ? " is-stale" : ""}`}>
            {MODE_OPTIONS.find((o) => o.id === savedMode)?.label ?? savedMode}
          </span>
        </SettlementSectionHead>
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

              <SettlementOptionGroup
                ariaLabel="Pricing mode"
                variant="radiogroup"
                duo
                locked={!canEdit}
                selectedId={pricingMode}
                onSelect={selectMode}
                options={MODE_OPTIONS.map((opt) => {
                  const off = !modeEnabled(opt.id);
                  return {
                    id: opt.id,
                    eyebrow: opt.label,
                    value: opt.value,
                    hint: off ? `${opt.blurb} (disabled by platform)` : opt.blurb,
                    disabled: off,
                    className: off || !canEdit ? "is-disabled" : undefined,
                  };
                })}
              />

              <div className="stl-lock">
                <div className="stl-lock__copy">
                  <span className="stl-lock__label">Quote lock</span>
                  <span className="stl-lock__hint">
                    Rate is locked for this window when a pay method is quoted.
                  </span>
                </div>
                <div className="stl-seg" role="radiogroup" aria-label="Quote lock">
                  {allowedLocks.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={quoteLockSeconds === s}
                      className={`stl-seg__btn${quoteLockSeconds === s ? " is-active" : ""}`}
                      disabled={!canEdit}
                      onClick={() => selectLock(s)}
                    >
                      {lockLabel(s)}
                    </button>
                  ))}
                </div>
              </div>
              {canEdit ? (
                <div className="plat-settlement__form-actions">
                  <button
                    type="submit"
                    className="btn-primary plat-settings__submit"
                    disabled={saving || !dirty || loading}
                  >
                    {saving ? "Saving…" : "Save pricing"}
                  </button>
                </div>
              ) : null}
            </form>
          )}
        </div>
      </section>
  );

  return (
    <>
      {toast}
      {card}
    </>
  );
}
