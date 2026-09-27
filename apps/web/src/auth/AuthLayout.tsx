import { lazy, Suspense, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ThemeToggleButton } from "../shared/ThemeToggleButton";
import { LoginBrandHeader } from "./LoginBrandHeader";
import { LoginHero } from "./LoginHero";

const AuthBackground = lazy(() =>
  import("./AuthBackground").then((m) => ({ default: m.AuthBackground })),
);

type Props = {
  children: ReactNode;
  wide?: boolean;
  footer?: boolean;
  /** Gate mark + wordmark above the card (portal login). */
  showBrand?: boolean;
  /**
   * Split marketing + form layout.
   * Default on for portal sign-in.
   */
  split?: boolean;
  /** Product line under PaymentGate on the hero (split only). */
  productLine?: string;
};

export function AuthLayout({
  children,
  wide = false,
  footer = true,
  showBrand = false,
  split = true,
  productLine,
}: Props) {
  if (split) {
    return (
      <div className="login-wrap login-wrap--split">
        <LoginHero productLine={productLine} />
        <div className="login-stage login-stage--split">
          <div className="login-stage__theme">
            <ThemeToggleButton />
          </div>
          <div className={`login-column${wide ? " login-column--wide" : ""}`}>
            {children}
          </div>
          {footer ? (
            <footer className="login-footer login-footer--split">
              <p className="login-footer__access">
                Need access? Contact your administrator.
              </p>
              <p className="login-footer__copy">
                © {new Date().getFullYear()} PaymentGate. All rights reserved.
              </p>
            </footer>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={`login-wrap${wide ? " login-wrap--wide" : ""}`}>
      <Suspense fallback={null}>
        <AuthBackground />
      </Suspense>
      <div className="login-stage">
        <div className="login-stage__theme login-stage__theme--overlay">
          <ThemeToggleButton />
        </div>
        <div className={`login-column${wide ? " login-column--wide" : ""}`}>
          {showBrand ? (
            <div className="login-brand-slot">
              <LoginBrandHeader />
            </div>
          ) : null}
          {children}
        </div>
        {footer ? (
          <footer className="login-footer">
            <span>Need help? </span>
            <a href="mailto:support@paymentgate.io">support@paymentgate.io</a>
            {" · "}
            <Link to="/">PaymentGate home</Link>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
