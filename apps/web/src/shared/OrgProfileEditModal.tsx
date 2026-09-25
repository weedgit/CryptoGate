import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { OrgBrandMark } from "./OrgBrandMark";
import { readOrgIconFile } from "./orgBrand";
import { ONBOARD_COUNTRY_OPTIONS } from "./onboardMerchantUi";
import { isTronReceiveAddress } from "@paymentgate/domain";
import { AssetIcon } from "../platform/cryptoIcons";
import { platformFeeAsset } from "./platformFeePair";
import { FieldControl } from "../ui/FieldControl";
import { SearchableSelect } from "../ui/SearchableSelect";
import { CopyGlyph } from "./CopyGlyph";

type Props = {
  open: boolean;
  name: string;
  iconKey?: string | null;
  country?: string | null;
  legalName?: string | null;
  billingEmail?: string | null;
  /** When false, country is optional (agent). Default true. */
  requireCountry?: boolean;
  /** Agent commission. Omit on merchant and site edits. */
  commission?: {
    rateMode: "automatic" | "fixed";
    commissionPercent: string;
  } | null;
  /** Volume-schedule commission % shown read-only while mode is automatic. */
  automaticRate?: string | null;
  /** Shown under the logo, e.g. Agent. */
  typeLabel?: string | null;
  /**
   * Agent USDT (TRC-20) payout wallet. Omit on merchant and site edits.
   * Pass "" when the agent has no address yet.
   */
  payoutAddress?: string | null;
  /** Merchant commercial tier, matching mode, and amount mode. */
  merchant?: {
    rateMode: "automatic" | "fixed";
    tier: string;
    volumeFeePercent: string;
    scheduleLabel: string;
    tiers: {
      id: string;
      label: string;
      defaultPercent: string;
      minPercent?: string;
      maxPercent?: string;
    }[];
    matchingMode: string;
    pricingMode: string;
    /** Watch-only public key (xPub) for Mode S — platform O/A view & edit. */
    publicKey?: string;
    /** Billing schedule / activation flags (platform ops). */
    billingSchedule?: {
      statusLabel: string;
      skipActivation: boolean;
      feeExemptUntil: string;
      billingOpsNote: string;
    };
  } | null;
  busy?: boolean;
  error?: string | null;
  /** Platform Owner only — lock Fixed merchant/agent rates. Default true when omitted. */
  canLockFixedRates?: boolean;
  onClose: () => void;
  onSave: (next: {
    name: string;
    iconKey: string | null;
    country: string;
    legalName: string;
    billingEmail: string;
    commission?: {
      rateMode: "automatic" | "fixed";
      commissionPercent: string;
    };
    payoutAddress?: string;
    merchant?: {
      rateMode: "automatic" | "fixed";
      tier: string;
      volumeFeePercent: string;
      matchingMode: string;
      pricingMode: string;
      publicKey?: string;
      billingSchedule?: {
        skipActivation: boolean;
        feeExemptUntil: string;
        billingOpsNote: string;
      };
    };
  }) => void | Promise<void>;
};

export function WalletCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const address = value.trim();

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className={`org-edit__wallet-copy${copied ? " is-copied" : ""}`}
      disabled={!address}
      onClick={() => void copy()}
      aria-label={copied ? "Address copied" : "Copy wallet address"}
      title={copied ? "Copied" : "Copy"}
    >
      <CopyGlyph copied={copied} />
    </button>
  );
}

const MATCHING_MODE_OPTIONS = [
  { id: "B", label: "Mode B · Standard" },
  { id: "C", label: "Mode C · Amount fingerprint" },
  { id: "S", label: "Mode S · Smart address" },
];

function normalizeMatchingMode(mode: string | null | undefined): string {
  if (mode === "C" || mode === "S") return mode;
  return "B";
}

/** Match Fixed volume fee % to the platform fee-band that contains it. */
function tierForVolumeFeePercent(
  volumeFeePercent: string,
  tiers: {
    id: string;
    label: string;
    defaultPercent: string;
    minPercent?: string;
    maxPercent?: string;
  }[],
): string | null {
  const fee = Number(volumeFeePercent.trim());
  if (!Number.isFinite(fee) || tiers.length === 0) return null;
  const rank: Record<string, number> = { enterprise: 3, mid: 2, small: 1 };
  const inBand = tiers
    .map((row) => {
      const min = Number(row.minPercent ?? row.defaultPercent);
      const max = Number(row.maxPercent ?? row.defaultPercent);
      return { id: row.id, min, max };
    })
    .filter(
      (band) =>
        Number.isFinite(band.min) &&
        Number.isFinite(band.max) &&
        fee >= Math.min(band.min, band.max) &&
        fee <= Math.max(band.min, band.max),
    )
    .sort((a, b) => (rank[b.id] ?? 0) - (rank[a.id] ?? 0))[0];
  if (inBand) return inBand.id;

  // Outside every band — closest default signup rate.
  let best = tiers[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const row of tiers) {
    const d = Math.abs(fee - Number(row.defaultPercent));
    if (!Number.isFinite(d)) continue;
    if (d < bestDist) {
      bestDist = d;
      best = row;
    }
  }
  return best?.id ?? null;
}

const PRICING_MODE_OPTIONS = [
  { id: "pegged_1to1", label: "Pegged 1:1" },
  { id: "market", label: "Always market" },
  { id: "usd_to_token", label: "USD to token" },
  { id: "token_to_usd", label: "Token amount to USD" },
];

function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 20h16M6 20V6.5A1.5 1.5 0 0 1 7.5 5h9A1.5 1.5 0 0 1 18 6.5V20" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 9h2M13 9h2M9 13h2M13 13h2M10 20v-3h4v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 3.8V8h4.2M8 12h8M8 16h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 12h16M12 4c2.4 2.6 2.4 13.4 0 16M12 4c-2.4 2.6-2.4 13.4 0 16" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function ModeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 7h4v4H7V7Zm6 0h4v4h-4V7ZM7 13h4v4H7v-4Zm6 2h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="10" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 10h8M17 10v3.5M20 10v2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PercentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M17 7 7 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" stroke="currentColor" strokeWidth="1.85" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M13.5 6.5 17.5 10.5" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 16V6M8 9.5 12 5.5l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 5.5A1.5 1.5 0 0 1 6.5 4h9.2L19.5 7.8V18.5A1.5 1.5 0 0 1 18 20H6.5A1.5 1.5 0 0 1 5 18.5v-13Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8 4.5V9h6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 20v-5.2h8V20" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function FieldLabel({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <span className="org-edit__label">
      {children}
      {extra}
    </span>
  );
}

export function OrgProfileEditModal({
  open,
  name,
  iconKey = null,
  country = "",
  legalName = "",
  billingEmail = "",
  requireCountry = true,
  commission = null,
  automaticRate = null,
  typeLabel = null,
  payoutAddress,
  merchant = null,
  busy = false,
  error = null,
  canLockFixedRates = true,
  onClose,
  onSave,
}: Props) {
  const titleId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draftName, setDraftName] = useState(name);
  const [draftIcon, setDraftIcon] = useState<string | null>(iconKey ?? null);
  const [draftCountry, setDraftCountry] = useState(country?.trim() ?? "");
  const [draftLegal, setDraftLegal] = useState(legalName?.trim() ?? "");
  const [draftBilling, setDraftBilling] = useState(billingEmail?.trim() ?? "");
  const [draftRateMode, setDraftRateMode] = useState<"automatic" | "fixed">(
    commission?.rateMode === "fixed" ? "fixed" : "automatic",
  );
  const [draftCommission, setDraftCommission] = useState(
    commission?.commissionPercent ?? "",
  );
  const [draftPayout, setDraftPayout] = useState(payoutAddress?.trim() ?? "");
  const [draftCommercialMode, setDraftCommercialMode] = useState<"automatic" | "fixed">(
    merchant?.rateMode === "fixed" ? "fixed" : "automatic",
  );
  const [draftTier, setDraftTier] = useState(merchant?.tier ?? "small");
  const [draftVolume, setDraftVolume] = useState(merchant?.volumeFeePercent ?? "");
  const [draftMatching, setDraftMatching] = useState(
    normalizeMatchingMode(merchant?.matchingMode),
  );
  const [draftPricing, setDraftPricing] = useState(merchant?.pricingMode ?? "pegged_1to1");
  const [draftPublicKey, setDraftPublicKey] = useState(
    merchant?.publicKey?.trim() ?? "",
  );
  const [draftSkipActivation, setDraftSkipActivation] = useState(
    Boolean(merchant?.billingSchedule?.skipActivation),
  );
  const [draftFeeExemptUntil, setDraftFeeExemptUntil] = useState(
    merchant?.billingSchedule?.feeExemptUntil ?? "",
  );
  const [draftBillingOpsNote, setDraftBillingOpsNote] = useState(
    merchant?.billingSchedule?.billingOpsNote ?? "",
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const [readingFile, setReadingFile] = useState(false);

  const countryOptions = (() => {
    const current = draftCountry.trim();
    if (
      current &&
      !ONBOARD_COUNTRY_OPTIONS.some((o) => o.id === current)
    ) {
      return [{ id: current, label: current }, ...ONBOARD_COUNTRY_OPTIONS];
    }
    return ONBOARD_COUNTRY_OPTIONS;
  })();

  useEffect(() => {
    if (!open) return;
    setDraftName(name);
    setDraftIcon(iconKey ?? null);
    setDraftCountry(country?.trim() ?? "");
    setDraftLegal(legalName?.trim() || name);
    setDraftBilling(billingEmail?.trim() ?? "");
    setDraftRateMode(commission?.rateMode === "fixed" ? "fixed" : "automatic");
    setDraftCommission(commission?.commissionPercent ?? "");
    setDraftPayout(payoutAddress?.trim() ?? "");
    setDraftCommercialMode(merchant?.rateMode === "fixed" ? "fixed" : "automatic");
    setDraftTier(merchant?.tier ?? "small");
    setDraftVolume(merchant?.volumeFeePercent ?? "");
    setDraftMatching(normalizeMatchingMode(merchant?.matchingMode));
    setDraftPricing(merchant?.pricingMode ?? "pegged_1to1");
    setDraftPublicKey(merchant?.publicKey?.trim() ?? "");
    setDraftSkipActivation(Boolean(merchant?.billingSchedule?.skipActivation));
    setDraftFeeExemptUntil(merchant?.billingSchedule?.feeExemptUntil ?? "");
    setDraftBillingOpsNote(merchant?.billingSchedule?.billingOpsNote ?? "");
    setFileError(null);
    setReadingFile(false);
  }, [
    open,
    name,
    iconKey,
    country,
    legalName,
    billingEmail,
    commission?.rateMode,
    commission?.commissionPercent,
    payoutAddress,
    merchant?.rateMode,
    merchant?.tier,
    merchant?.volumeFeePercent,
    merchant?.matchingMode,
    merchant?.pricingMode,
    merchant?.publicKey,
    merchant?.billingSchedule?.skipActivation,
    merchant?.billingSchedule?.feeExemptUntil,
    merchant?.billingSchedule?.billingOpsNote,
  ]);

  const matchedFixedTier =
    merchant && draftCommercialMode === "fixed"
      ? tierForVolumeFeePercent(draftVolume, merchant.tiers)
      : null;

  useEffect(() => {
    if (!open || !merchant || draftCommercialMode !== "fixed") return;
    if (!matchedFixedTier || matchedFixedTier === draftTier) return;
    setDraftTier(matchedFixedTier);
  }, [
    open,
    merchant,
    draftCommercialMode,
    matchedFixedTier,
    draftTier,
  ]);

  if (!open) return null;

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    setReadingFile(true);
    try {
      const dataUrl = await readOrgIconFile(file);
      setDraftIcon(dataUrl);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Could not use that file");
    } finally {
      setReadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saving = busy || readingFile;
  const billingOk = draftBilling.trim().includes("@");
  const countryOk = !requireCountry || draftCountry.trim().length > 0;
  const commissionOk =
    commission == null ||
    draftRateMode === "automatic" ||
    draftCommission.trim().length > 0;
  const merchantOk =
    merchant == null ||
    draftCommercialMode === "automatic" ||
    (draftVolume.trim().length > 0 &&
      (matchedFixedTier != null || draftTier.trim().length > 0));
  const payoutShown = payoutAddress !== undefined;
  const payoutNext = draftPayout.trim();
  const payoutPrev = (payoutAddress ?? "").trim();
  const payoutChanged = payoutShown && payoutNext !== payoutPrev;
  const payoutOk =
    !payoutChanged || (payoutNext.length > 0 && isTronReceiveAddress(payoutNext));
  const matchedFixedTierLabel =
    matchedFixedTier == null
      ? "—"
      : merchant?.tiers.find((t) => t.id === matchedFixedTier)?.label ?? matchedFixedTier;

  const canSave =
    draftName.trim().length >= 2 &&
    countryOk &&
    billingOk &&
    commissionOk &&
    merchantOk &&
    payoutOk;

  return createPortal(
    <div
      className="b3-commission-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="b3-commission-modal org-profile-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="org-edit__head">
          <span className="org-edit__head-icon" aria-hidden>
            <PencilIcon />
          </span>
          <div className="org-edit__head-copy">
            <h3 id={titleId}>Edit organization</h3>
            <p>Update your organization details and settings.</p>
          </div>
          <div className="org-edit__waves" aria-hidden>
            <svg viewBox="0 0 640 96" preserveAspectRatio="none">
              <defs>
                <linearGradient id="org-edit-gold-a" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(255,208,96,0)" />
                  <stop offset="18%" stopColor="rgba(255,220,140,0.82)" />
                  <stop offset="45%" stopColor="rgba(255,208,96,0.52)" />
                  <stop offset="72%" stopColor="rgba(255,193,69,0.24)" />
                  <stop offset="100%" stopColor="rgba(255,208,96,0)" />
                </linearGradient>
                <linearGradient id="org-edit-gold-b" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(255,208,96,0)" />
                  <stop offset="26%" stopColor="rgba(255,230,160,0.58)" />
                  <stop offset="55%" stopColor="rgba(255,193,69,0.3)" />
                  <stop offset="100%" stopColor="rgba(255,208,96,0)" />
                </linearGradient>
                <linearGradient id="org-edit-gold-c" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(255,208,96,0)" />
                  <stop offset="34%" stopColor="rgba(255,208,96,0.4)" />
                  <stop offset="66%" stopColor="rgba(255,193,69,0.16)" />
                  <stop offset="100%" stopColor="rgba(255,208,96,0)" />
                </linearGradient>
              </defs>
              <path
                d="M80 62 C 180 58, 240 30, 340 36 C 430 42, 500 56, 580 50"
                fill="none"
                stroke="url(#org-edit-gold-a)"
                strokeWidth="1.55"
                strokeLinecap="round"
              />
              <path
                d="M100 74 C 200 70, 260 46, 360 50 C 450 54, 510 66, 570 62"
                fill="none"
                stroke="url(#org-edit-gold-b)"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.95"
              />
              <path
                d="M120 50 C 210 46, 270 68, 370 62 C 460 56, 520 40, 590 44"
                fill="none"
                stroke="url(#org-edit-gold-c)"
                strokeWidth="1"
                strokeLinecap="round"
                opacity="0.8"
              />
            </svg>
          </div>
          <button
            type="button"
            className="org-edit__close"
            aria-label="Close"
            disabled={saving}
            onClick={onClose}
          >
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="org-edit__layout">
          <aside className="org-edit__brand">
            <OrgBrandMark
              name={draftName.trim() || name}
              iconKey={draftIcon}
              size={88}
              className="org-edit__mark"
            />
            <p className="org-edit__name">{draftName.trim() || name}</p>
            {typeLabel ? <span className="org-edit__type">{typeLabel}</span> : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
              className="sr-only"
              disabled={saving}
              onChange={(e) => void onPickFile(e.target.files?.[0])}
            />
            <button
              type="button"
              className="org-edit__choose"
              disabled={saving}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon />
              {readingFile ? "Reading…" : "Choose image"}
            </button>
            <p className="org-edit__file-hint">PNG, JPEG, WebP or GIF (max 2MB)</p>
            {fileError ? <p className="org-edit__file-error">{fileError}</p> : null}
            <div className="org-edit__wordmark">
              <span>PaymentGate</span>
              <small>POWERING PAYMENTS</small>
            </div>
          </aside>

          <div className="org-edit__form">
            <div className="org-edit__grid">
              <label className="org-edit__field">
                <FieldLabel>Business name</FieldLabel>
                <FieldControl leading={<BuildingIcon />}>
                  <input
                    className="field-control"
                    value={draftName}
                    maxLength={120}
                    disabled={saving}
                    onChange={(e) => setDraftName(e.target.value)}
                    autoFocus
                  />
                </FieldControl>
              </label>

              <label className="org-edit__field">
                <FieldLabel>Legal name (invoices)</FieldLabel>
                <FieldControl leading={<DocIcon />}>
                  <input
                    className="field-control"
                    value={draftLegal}
                    maxLength={200}
                    disabled={saving}
                    onChange={(e) => setDraftLegal(e.target.value)}
                  />
                </FieldControl>
              </label>

              <label className="org-edit__field org-edit__field--gap">
                <FieldLabel>Billing email</FieldLabel>
                <FieldControl
                  icon="mail"
                  trailing={
                    !draftBilling.trim() ? <span className="org-edit__req" aria-hidden /> : undefined
                  }
                >
                  <input
                    className="field-control"
                    type="email"
                    value={draftBilling}
                    maxLength={254}
                    disabled={saving}
                    placeholder="Enter billing email"
                    onChange={(e) => setDraftBilling(e.target.value)}
                  />
                </FieldControl>
              </label>

              <div className="org-edit__field org-edit__field--gap">
                <FieldLabel>
                  Country{requireCountry ? "" : " (optional)"}
                </FieldLabel>
                <FieldControl leading={<GlobeIcon />}>
                  <SearchableSelect
                    id={`${titleId}-country-select`}
                    value={draftCountry}
                    options={countryOptions}
                    placeholder="Select country"
                    emptyLabel="Select country"
                    disabled={saving}
                    onChange={setDraftCountry}
                  />
                </FieldControl>
              </div>

              {merchant ? (
                <div className="org-edit__field org-edit__field--gap">
                  <FieldLabel>Commercial tier</FieldLabel>
                  <FieldControl leading={<PercentIcon />}>
                    <SearchableSelect
                      id={`${titleId}-commercial`}
                      value={draftCommercialMode}
                      options={[
                        { id: "automatic", label: "Automatic" },
                        ...(canLockFixedRates || draftCommercialMode === "fixed"
                          ? [{ id: "fixed", label: "Fixed rate" }]
                          : []),
                      ]}
                      allowEmpty={false}
                      disabled={saving}
                      onChange={(id) => {
                        const next =
                          id === "fixed" && canLockFixedRates
                            ? "fixed"
                            : "automatic";
                        setDraftCommercialMode(next);
                        if (next === "fixed" && !draftVolume.trim()) {
                          const band = merchant.tiers.find((t) => t.id === draftTier);
                          setDraftVolume(band?.defaultPercent ?? merchant.volumeFeePercent);
                        }
                      }}
                    />
                  </FieldControl>
                  {!canLockFixedRates ? (
                    <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.8rem" }}>
                      Fixed rates require Platform Owner. You can still switch to Automatic.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {merchant && draftCommercialMode === "automatic" ? (
                <label className="org-edit__field org-edit__field--readonly org-edit__field--gap">
                  <FieldLabel>Schedule</FieldLabel>
                  <FieldControl leading={<PercentIcon />}>
                    <input
                      className="field-control"
                      value={merchant.scheduleLabel}
                      readOnly
                      aria-readonly="true"
                      tabIndex={-1}
                    />
                  </FieldControl>
                </label>
              ) : null}

              {merchant && draftCommercialMode === "fixed" ? (
                <label className="org-edit__field org-edit__field--gap">
                  <span className="org-edit__field-head">
                    <FieldLabel>Volume fee %</FieldLabel>
                    <span
                      className="org-edit__tier-budget"
                      title="Tier matched from volume fee % band"
                    >
                      {matchedFixedTierLabel}
                    </span>
                  </span>
                  <FieldControl leading={<PercentIcon />}>
                    <input
                      className="field-control"
                      type="text"
                      inputMode="decimal"
                      value={draftVolume}
                      maxLength={8}
                      disabled={saving}
                      onChange={(e) => setDraftVolume(e.target.value)}
                      placeholder="2"
                      aria-describedby={
                        matchedFixedTier ? `${titleId}-tier-match` : undefined
                      }
                    />
                  </FieldControl>
                  {matchedFixedTier ? (
                    <span id={`${titleId}-tier-match`} className="sr-only">
                      Matched tier {matchedFixedTierLabel}
                    </span>
                  ) : null}
                </label>
              ) : null}

              {merchant ? (
                <div className="org-edit__field">
                  <FieldLabel>Mode</FieldLabel>
                  <FieldControl leading={<ModeIcon />}>
                    <SearchableSelect
                      id={`${titleId}-matching`}
                      value={draftMatching}
                      options={[...MATCHING_MODE_OPTIONS]}
                      allowEmpty={false}
                      disabled={saving}
                      onChange={setDraftMatching}
                    />
                  </FieldControl>
                </div>
              ) : null}

              {merchant ? (
                <div className="org-edit__field">
                  <FieldLabel>Fund rate</FieldLabel>
                  <FieldControl icon="coins">
                    <SearchableSelect
                      id={`${titleId}-pricing`}
                      value={draftPricing}
                      options={[...PRICING_MODE_OPTIONS]}
                      allowEmpty={false}
                      disabled={saving}
                      onChange={setDraftPricing}
                    />
                  </FieldControl>
                </div>
              ) : null}

              {merchant ? (
                <label className="org-edit__field org-edit__field--wide">
                  <span className="org-edit__field-head">
                    <FieldLabel>Public key</FieldLabel>
                    {draftMatching === "S" ? (
                      <span className="org-edit__mode-active" title="Smart address matching is active">
                        Active
                      </span>
                    ) : null}
                  </span>
                  <FieldControl
                    leading={<KeyIcon />}
                    trailing={<WalletCopyButton value={draftPublicKey} />}
                  >
                    <input
                      className="field-control"
                      value={draftPublicKey}
                      maxLength={256}
                      disabled={saving}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="xpub… / zpub… / watch-only public key"
                      aria-label="Public key"
                      onChange={(e) => setDraftPublicKey(e.target.value)}
                    />
                  </FieldControl>
                </label>
              ) : null}

              {merchant?.billingSchedule ? (
                <>
                  <div className="org-edit__field org-edit__field--wide org-edit__field--gap">
                    <FieldLabel>Billing schedule</FieldLabel>
                    <p className="org-edit__readonly-value">
                      {merchant.billingSchedule.statusLabel}
                    </p>
                  </div>
                  <label className="org-edit__field org-edit__check">
                    <input
                      type="checkbox"
                      checked={draftSkipActivation}
                      disabled={saving}
                      onChange={(e) => setDraftSkipActivation(e.target.checked)}
                    />
                    <span>Skip activation invoice</span>
                  </label>
                  <label className="org-edit__field">
                    <FieldLabel>Fee exempt until</FieldLabel>
                    <FieldControl>
                      <input
                        className="field-control"
                        type="date"
                        value={draftFeeExemptUntil}
                        disabled={saving}
                        onChange={(e) => setDraftFeeExemptUntil(e.target.value)}
                      />
                    </FieldControl>
                  </label>
                  <label className="org-edit__field org-edit__field--wide">
                    <FieldLabel>Billing ops note</FieldLabel>
                    <FieldControl>
                      <input
                        className="field-control"
                        value={draftBillingOpsNote}
                        maxLength={240}
                        disabled={saving}
                        placeholder="Optional note"
                        onChange={(e) => setDraftBillingOpsNote(e.target.value)}
                      />
                    </FieldControl>
                  </label>
                </>
              ) : null}

              {commission ? (
                <div className="org-edit__field org-edit__field--gap">
                  <FieldLabel>Commission</FieldLabel>
                  <FieldControl leading={<PercentIcon />}>
                    <SearchableSelect
                      id={`${titleId}-commission`}
                      value={draftRateMode}
                      options={[
                        { id: "automatic", label: "Automatic" },
                        ...(canLockFixedRates
                          ? [{ id: "fixed", label: "Fixed rate" }]
                          : []),
                      ]}
                      allowEmpty={false}
                      disabled={saving || !canLockFixedRates}
                      onChange={(id) =>
                        setDraftRateMode(
                          id === "fixed" && canLockFixedRates
                            ? "fixed"
                            : "automatic",
                        )
                      }
                    />
                  </FieldControl>
                  {!canLockFixedRates ? (
                    <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.8rem" }}>
                      Commission edits require Platform Owner.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {commission && draftRateMode === "automatic" ? (
                <label className="org-edit__field org-edit__field--readonly org-edit__field--gap">
                  <FieldLabel>Rate</FieldLabel>
                  <FieldControl leading={<PercentIcon />}>
                    <input
                      className="field-control"
                      value={automaticRate?.trim() ? `${automaticRate.trim()}%` : "—"}
                      readOnly
                      aria-readonly="true"
                      tabIndex={-1}
                    />
                  </FieldControl>
                </label>
              ) : null}

              {commission && draftRateMode === "fixed" ? (
                <label className="org-edit__field org-edit__field--gap">
                  <FieldLabel>Fixed commission %</FieldLabel>
                  <FieldControl leading={<PercentIcon />}>
                    <input
                      className="field-control"
                      type="text"
                      inputMode="decimal"
                      value={draftCommission}
                      maxLength={8}
                      disabled={saving}
                      onChange={(e) => setDraftCommission(e.target.value)}
                      placeholder="15"
                    />
                  </FieldControl>
                </label>
              ) : null}

              {payoutShown ? (
                <label className="org-edit__field org-edit__field--wide">
                  <span className="org-edit__field-head">
                    <FieldLabel>Payout address</FieldLabel>
                    <span className="org-edit__aside-note">
                      A change asks for your authenticator code
                    </span>
                  </span>
                  <FieldControl leading={<AssetIcon asset={platformFeeAsset()} />}>
                    <input
                      className="field-control"
                      value={draftPayout}
                      maxLength={64}
                      disabled={saving}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="Tron address (starts with T)"
                      onChange={(e) => setDraftPayout(e.target.value)}
                    />
                  </FieldControl>
                </label>
              ) : null}
            </div>
            {error ? <p className="org-edit__file-error">{error}</p> : null}
          </div>
        </div>

        <footer className="org-edit__foot">
          <button type="button" className="org-edit__cancel" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="org-edit__save"
            disabled={saving || !canSave}
            onClick={() =>
              void onSave({
                name: draftName.trim(),
                iconKey: draftIcon,
                country: draftCountry.trim(),
                legalName: draftLegal.trim() || draftName.trim(),
                billingEmail: draftBilling.trim(),
                ...(commission
                  ? {
                      commission: {
                        rateMode: draftRateMode,
                        commissionPercent: draftCommission.trim(),
                      },
                    }
                  : {}),
                ...(payoutShown ? { payoutAddress: payoutNext } : {}),
                ...(merchant
                  ? {
                      merchant: {
                        rateMode: draftCommercialMode,
                        tier: matchedFixedTier ?? draftTier,
                        volumeFeePercent: draftVolume.trim(),
                        matchingMode: draftMatching,
                        pricingMode: draftPricing,
                        publicKey: draftPublicKey.trim(),
                        ...(merchant.billingSchedule
                          ? {
                              billingSchedule: {
                                skipActivation: draftSkipActivation,
                                feeExemptUntil: draftFeeExemptUntil.trim(),
                                billingOpsNote: draftBillingOpsNote.trim(),
                              },
                            }
                          : {}),
                      },
                    }
                  : {}),
              })
            }
          >
            <SaveIcon />
            {busy ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
