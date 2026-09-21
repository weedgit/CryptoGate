import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** Shared glyphs / pieces for onboard-merchant wizard (doc/image/onboardMerchant.png). */

export function OnboardBrandIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.85" />
      <path
        d="M19 8v6M16 11h6"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HierarchyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="6.5" y="1.5" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1.5" y="12.5" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.5" y="12.5" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9 5.5V8.5M9 8.5H4V12.5M9 8.5H14V12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Read-only parent card — matches doc/image/onboard_merchant.png. */
export function OnboardFixedParent({
  id,
  name,
  typeLabel,
  mark,
  hint = "Merchant is created under this parent.",
}: {
  id?: string;
  name: string;
  typeLabel: string;
  mark: ReactNode;
  hint?: string;
}) {
  return (
    <div
      id={id}
      className="b4-parent-card"
      role="group"
      aria-label={`Parent organization ${name}, ${typeLabel}.`}
    >
      <span className="b4-parent-card__label">Parent organization</span>
      <span className="b4-parent-card__mark" aria-hidden>
        {mark}
      </span>
      <span className="b4-parent-card__name">{name}</span>
      <span className="b4-parent-card__type">{typeLabel}</span>
      <span className="b4-parent-card__hint">{hint}</span>
    </div>
  );
}

export function PercentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="5" cy="5" r="1.75" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="13" cy="13" r="1.75" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M14.25 3.75L3.75 14.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Vertical up/down spin control — matches doc/image/onboard_merchant.png volume fee. */
export function NumberSpinButtons({
  onUp,
  onDown,
  disabled = false,
}: {
  onUp: () => void;
  onDown: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="b4-number-spin" role="group" aria-label="Adjust value">
      <button
        type="button"
        className="b4-number-spin__btn"
        aria-label="Increase"
        disabled={disabled}
        tabIndex={-1}
        onClick={onUp}
      >
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden>
          <path
            d="M1 5l4-4 4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className="b4-number-spin__btn"
        aria-label="Decrease"
        disabled={disabled}
        tabIndex={-1}
        onClick={onDown}
      >
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden>
          <path
            d="M1 1l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

/** Nudge a decimal string by `delta`, optionally clamped. */
export function nudgeDecimalString(
  current: string,
  delta: number,
  min?: number,
  max?: number,
): string {
  const n = Number(current);
  const base = Number.isFinite(n) ? n : 0;
  let next = Math.round((base + delta) * 10) / 10;
  if (min != null && Number.isFinite(min)) next = Math.max(min, next);
  if (max != null && Number.isFinite(max)) next = Math.min(max, next);
  return String(next);
}

export function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3 14.5V9.5M9 14.5V3.5M15 14.5V7.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const ONBOARD_COUNTRY_OPTIONS: { id: string; label: string }[] = [
  { id: "Singapore (SG)", label: "Singapore (SG)" },
  { id: "United States (US)", label: "United States (US)" },
  { id: "United Kingdom (GB)", label: "United Kingdom (GB)" },
  { id: "Australia (AU)", label: "Australia (AU)" },
  { id: "Hong Kong (HK)", label: "Hong Kong (HK)" },
  { id: "Japan (JP)", label: "Japan (JP)" },
  { id: "Malaysia (MY)", label: "Malaysia (MY)" },
  { id: "Indonesia (ID)", label: "Indonesia (ID)" },
  { id: "Thailand (TH)", label: "Thailand (TH)" },
  { id: "Philippines (PH)", label: "Philippines (PH)" },
  { id: "Vietnam (VN)", label: "Vietnam (VN)" },
  { id: "India (IN)", label: "India (IN)" },
  { id: "United Arab Emirates (AE)", label: "United Arab Emirates (AE)" },
  { id: "Germany (DE)", label: "Germany (DE)" },
  { id: "Canada (CA)", label: "Canada (CA)" },
];

/** Label left + short description right — matches Onboard agent field heads. */
export function OnboardFieldHead({
  htmlFor,
  label,
  lede,
}: {
  htmlFor?: string;
  label: string;
  lede?: ReactNode;
}) {
  return (
    <div className="b4-field__head">
      {htmlFor ? (
        <label className="b4-field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="b4-field__label">{label}</span>
      )}
      {lede ? <span className="b4-field__lede">{lede}</span> : null}
    </div>
  );
}

export function OnboardWizardBrandHead({
  titleId,
  title,
  subtitle,
  closeTo,
}: {
  titleId: string;
  title: string;
  subtitle: ReactNode;
  closeTo: string;
}) {
  return (
    <header className="b4-wizard__head b4-wizard__head--brand">
      <div className="b4-wizard__head-aura" aria-hidden>
        <svg
          className="b4-wizard__head-aura-svg"
          viewBox="0 0 640 96"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="b4-wiz-gold-a" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,208,96,0)" />
              <stop offset="18%" stopColor="rgba(255,220,140,0.82)" />
              <stop offset="45%" stopColor="rgba(255,208,96,0.52)" />
              <stop offset="72%" stopColor="rgba(255,193,69,0.24)" />
              <stop offset="100%" stopColor="rgba(255,208,96,0)" />
            </linearGradient>
            <linearGradient id="b4-wiz-gold-b" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,208,96,0)" />
              <stop offset="26%" stopColor="rgba(255,230,160,0.58)" />
              <stop offset="55%" stopColor="rgba(255,193,69,0.3)" />
              <stop offset="100%" stopColor="rgba(255,208,96,0)" />
            </linearGradient>
            <linearGradient id="b4-wiz-gold-c" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,208,96,0)" />
              <stop offset="34%" stopColor="rgba(255,208,96,0.4)" />
              <stop offset="66%" stopColor="rgba(255,193,69,0.16)" />
              <stop offset="100%" stopColor="rgba(255,208,96,0)" />
            </linearGradient>
          </defs>
          <path
            d="M80 62 C 180 58, 240 30, 340 36 C 430 42, 500 56, 580 50"
            fill="none"
            stroke="url(#b4-wiz-gold-a)"
            strokeWidth="1.55"
            strokeLinecap="round"
          />
          <path
            d="M100 74 C 200 70, 260 46, 360 50 C 450 54, 510 66, 570 62"
            fill="none"
            stroke="url(#b4-wiz-gold-b)"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.95"
          />
          <path
            d="M120 50 C 210 46, 270 68, 370 62 C 460 56, 520 40, 590 44"
            fill="none"
            stroke="url(#b4-wiz-gold-c)"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.8"
          />
        </svg>
      </div>
      <div className="b4-wizard__brand">
        <span className="b4-wizard__brand-icon" aria-hidden>
          <OnboardBrandIcon />
        </span>
        <div className="b4-wizard__brand-copy">
          <h2 id={titleId} className="b4-wizard__title">
            {title}
          </h2>
          <p className="b4-wizard__subtitle">{subtitle}</p>
        </div>
      </div>
      <Link className="b4-wizard__close" to={closeTo} aria-label="Cancel and return">
        ×
      </Link>
    </header>
  );
}

/** @deprecated Prefer OnboardWizardBrandHead — same brand header for onboard wizards. */
export const OnboardMerchantHead = OnboardWizardBrandHead;
