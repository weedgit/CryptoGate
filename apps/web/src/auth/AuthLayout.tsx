import { lazy, Suspense, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LoginBrandHeader } from "./LoginBrandHeader";

const AuthBackground = lazy(() =>
  import("./AuthBackground").then((m) => ({ default: m.AuthBackground })),
);

type Props = {
  children: ReactNode;
  wide?: boolean;
  footer?: boolean;
  /** Gate mark + wordmark above the card (portal login). */
  showBrand?: boolean;
};

export function AuthLayout({
  children,
  wide = false,
  footer = true,
  showBrand = false,
}: Props) {
  return (
    <div className={`login-wrap${wide ? " login-wrap--wide" : ""}`}>
      <Suspense fallback={null}>
        <AuthBackground />
      </Suspense>
      <div className="login-stage">
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
