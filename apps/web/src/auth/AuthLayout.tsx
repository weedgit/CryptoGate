import type { ReactNode } from "react";
import { AuthBackground } from "./AuthBackground";

type Props = {
  children: ReactNode;
  wide?: boolean;
  footer?: boolean;
};

export function AuthLayout({
  children,
  wide = false,
  footer = true,
}: Props) {
  return (
    <div className={`login-wrap${wide ? " login-wrap--wide" : ""}`}>
      <AuthBackground />
      <div className="login-stage">
        <div className={`login-column${wide ? " login-column--wide" : ""}`}>
          {children}
        </div>
        {footer ? (
          <footer className="login-footer">
            <span>Need help? </span>
            <a href="mailto:support@cryptogate.io">support@cryptogate.io</a>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
