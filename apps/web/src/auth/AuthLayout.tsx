import type { ReactNode } from "react";
import { ThemeToggleButton } from "../shared/ThemeToggleButton";
import { LoginHero } from "./LoginHero";

type Props = {
  children: ReactNode;
  wide?: boolean;
  footer?: boolean;
  /** Product line under PaymentGate on the hero. */
  productLine?: string;
};

/** Split marketing hero + form layout shared by every auth screen. */
export function AuthLayout({
  children,
  wide = false,
  footer = true,
  productLine,
}: Props) {
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
