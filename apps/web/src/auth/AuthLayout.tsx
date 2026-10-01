import type { ReactNode } from "react";
import { ThemeToggleButton } from "../shared/ThemeToggleButton";
import { LoginBrand, LoginChains, LoginFeatures, LoginHero } from "./LoginHero";
import { LoginSceneBg } from "./LoginSceneBg";

export type AuthLayoutVariant = "center" | "split";

/** Every auth screen uses this; set to "split" for the hero-left / form-right layout. */
const DEFAULT_LAYOUT: AuthLayoutVariant = "center";

type Props = {
  children: ReactNode;
  wide?: boolean;
  footer?: boolean;
  /** Product line under PaymentGate (e.g. MERCHANT POS). */
  productLine?: string;
  layout?: AuthLayoutVariant;
};

function AuthFooter({ className }: { className: string }) {
  return (
    <footer className={className}>
      <p className="login-footer__copy">
        © {new Date().getFullYear()} PaymentGate. All rights reserved.
      </p>
    </footer>
  );
}

/** Shared auth chrome: full-screen scene with a centered card, or the split hero + form. */
export function AuthLayout({
  children,
  wide = false,
  footer = true,
  productLine,
  layout = DEFAULT_LAYOUT,
}: Props) {
  if (layout === "split") {
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
          {footer ? <AuthFooter className="login-footer login-footer--split" /> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap login-wrap--split login-wrap--center">
      <LoginSceneBg />
      <div className="login-stage__theme">
        <ThemeToggleButton />
      </div>
      <main className="login-center">
        <LoginBrand productLine={productLine} />
        <div className={`login-column${wide ? " login-column--wide" : ""}`}>{children}</div>
        <LoginChains />
      </main>
      <LoginFeatures className="login-center__features" />
      {footer ? <AuthFooter className="login-footer login-footer--split login-center__footer" /> : null}
    </div>
  );
}
