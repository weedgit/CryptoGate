import { GateLogoMark } from "./GateLogoMark";
import { BoltIcon, ClockIcon, ShieldCheckIcon } from "./LoginIcons";
import { LoginSceneBg } from "./LoginSceneBg";

type Props = {
  /** Short product line under brand (e.g. MERCHANT POS). */
  productLine?: string;
};

/** Coin symbols are defined once in LoginSceneBg's SVG defs and reused here. */
const CHAINS = [
  { id: "usdt", label: "USDT" },
  { id: "usdc", label: "USDC" },
  { id: "eth", label: "Ethereum" },
  { id: "trx", label: "TRON" },
  { id: "sol", label: "Solana" },
];

const FEATURES = [
  { icon: ShieldCheckIcon, title: "Non-custodial", caption: "Funds go straight to your wallet" },
  { icon: BoltIcon, title: "Direct settlement", caption: "No intermediaries or payout delays" },
  { icon: ClockIcon, title: "Real-time tracking", caption: "Live status for every payment" },
];

export function LoginBrand({ productLine = "MERCHANT POS" }: Props) {
  return (
    <div className="login-hero__brand">
      <GateLogoMark size={144} className="login-hero__mark" alt="" />
      <span className="login-hero__name">PAYMENTGATE</span>
      <span className="login-hero__product">{productLine}</span>
    </div>
  );
}

export function LoginChains() {
  return (
    <div className="login-hero__chains">
      <span className="login-hero__chain-stack" aria-hidden>
        {CHAINS.map((c) => (
          <svg key={c.id} className="login-hero__chain" viewBox="-24 -24 48 48">
            <use href={`#login-coin-${c.id}`} />
          </svg>
        ))}
      </span>
      <span className="login-hero__chains-label">
        {CHAINS.map((c) => c.label).join(" · ")}
      </span>
    </div>
  );
}

export function LoginFeatures({ className = "" }: { className?: string }) {
  return (
    <ul className={`login-hero__features${className ? ` ${className}` : ""}`}>
      {FEATURES.map(({ icon: Icon, title, caption }) => (
        <li key={title} className="login-hero__feature">
          <span className="login-hero__feature-badge">
            <Icon className="login-hero__feature-icon" />
          </span>
          <span className="login-hero__feature-copy">
            <span className="login-hero__feature-title">{title}</span>
            <span className="login-hero__feature-caption">{caption}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Left marketing pane (split layout) — soft settlement atmosphere + brand copy. */
export function LoginHero({ productLine = "MERCHANT POS" }: Props) {
  return (
    <aside className="login-hero" aria-label="Product highlight">
      <LoginSceneBg />

      <div className="login-hero__top">
        <LoginBrand productLine={productLine} />

        <div className="login-hero__copy">
          <p className="login-hero__eyebrow">
            <span className="login-hero__eyebrow-dot" aria-hidden />
            Multi-chain stablecoin payments
          </p>
          <h1 className="login-hero__headline">
            Crypto payments,{" "}
            <span className="login-hero__headline-accent">ready for your counter.</span>
          </h1>
          <p className="login-hero__sub">Accept USDT directly into your merchant wallet.</p>
          <LoginChains />
        </div>
      </div>

      <LoginFeatures />
    </aside>
  );
}
