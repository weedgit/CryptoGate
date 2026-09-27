import { GateLogoMark } from "./GateLogoMark";
import { BoltIcon, ShieldCheckIcon } from "./LoginIcons";
import { LoginSceneBg } from "./LoginSceneBg";

type Props = {
  /** Short product line under brand (e.g. MERCHANT POS). */
  productLine?: string;
};

/** Left marketing pane — soft settlement atmosphere + brand copy. */
export function LoginHero({ productLine = "MERCHANT POS" }: Props) {
  return (
    <aside className="login-hero" aria-label="Product highlight">
      <LoginSceneBg />

      <div className="login-hero__top">
        <div className="login-hero__brand">
          <GateLogoMark size={68} className="login-hero__mark" alt="" />
          <div className="login-hero__brand-copy">
            <span className="login-hero__name">PaymentGate</span>
            <span className="login-hero__product">{productLine}</span>
          </div>
        </div>

        <div className="login-hero__copy">
          <h1 className="login-hero__headline">
            Crypto payments,{" "}
            <span className="login-hero__headline-accent">ready for your counter.</span>
          </h1>
          <p className="login-hero__sub">Accept USDT directly into your merchant wallet.</p>
        </div>
      </div>

      <ul className="login-hero__features">
        <li className="login-hero__feature">
          <ShieldCheckIcon className="login-hero__feature-icon" />
          Non-custodial
        </li>
        <li className="login-hero__feature-sep" aria-hidden />
        <li className="login-hero__feature">
          <BoltIcon className="login-hero__feature-icon" />
          Direct settlement
        </li>
      </ul>
    </aside>
  );
}
