import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { Session } from "./api";
import { CashierRestrictedBanner } from "./CashierRestrictedBanner";
import { sessionIsCashierOnly } from "./org";

const OWNER_NAV = [
  { to: "/merchant", label: "Dashboard", end: true },
  { to: "/merchant/orders", label: "Orders", matchPrefix: "/merchant/orders" },
  { to: "/merchant/service-bills", label: "Service Bills" },
  { to: "/merchant/sites", label: "Sites" },
  { to: "/merchant/reports", label: "Reports" },
  {
    to: "/merchant/settings/settlement",
    label: "Settlement",
    matchPrefix: "/merchant/settings/settlement",
  },
  {
    to: "/merchant/settings/integrations",
    label: "Integrations",
    matchPrefix: "/merchant/settings/integrations",
  },
  { to: "/merchant/settings/organization", label: "Org" },
  { to: "/merchant/settings/billing", label: "Billing" },
  { to: "/merchant/settings/notifications", label: "Alerts" },
  { to: "/merchant/settings/team", label: "Team" },
] as const;

const CASHIER_NAV = [
  { to: "/merchant", label: "Dashboard", end: true },
  {
    to: "/merchant/orders",
    label: "My Orders",
    matchPrefix: "/merchant/orders",
    exclude: "/merchant/orders/new",
  },
  { to: "/merchant/orders/new", label: "Create Order" },
] as const;

type Props = {
  session: Session;
  title: string;
  crumb: string;
  children: ReactNode;
  onSignOut: () => void;
  showCashierBanner?: boolean;
};

export function MerchantShell({
  session,
  title,
  crumb,
  children,
  onSignOut,
  showCashierBanner = false,
}: Props) {
  const location = useLocation();
  const cashier = sessionIsCashierOnly(session);
  const nav = cashier ? CASHIER_NAV : OWNER_NAV;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo-row">
          <div className="logo-mark">CG</div>
          <div>
            <p className="logo-title">CryptoGate</p>
            <span className="logo-badge">
              {cashier ? "CASHIER PORTAL" : "OWNER PORTAL"}
            </span>
          </div>
        </div>
        <div>
          <p className="nav-label">{cashier ? "CASHIER TERMINAL" : "PORTAL CONTROLS"}</p>
          <nav className="nav-list">
            {nav.map((item) => {
              const prefix = "matchPrefix" in item ? item.matchPrefix : undefined;
              const exclude = "exclude" in item ? item.exclude : undefined;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={"end" in item ? item.end : false}
                  className={({ isActive }) => {
                    const path = location.pathname;
                    const prefixActive =
                      prefix != null &&
                      path.startsWith(prefix) &&
                      !(exclude && path.startsWith(exclude));
                    const active = isActive || prefixActive;
                    return `nav-item${active ? " active" : ""}`;
                  }}
                >
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
        <div className="sidebar-foot">
          <p>SESSION // {session.email}</p>
          <p>{cashier ? "Cashier Session Active" : "Merchant session"}</p>
          <p>
            <button type="button" className="sign-out-btn" onClick={onSignOut}>
              Sign out
            </button>
          </p>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <h1>{title}</h1>
          </div>
          <div className="topbar-right">
            <span className="net-pill">MAINNET ACTIVE</span>
            <div className="profile">
              <strong>{session.email}</strong>
              <span>{cashier ? "Terminal Operator" : "Merchant"}</span>
            </div>
          </div>
        </header>
        <div className="body">
          <div className="crumb">
            {cashier ? "Cashier Terminal" : "Merchant Terminal"} /{" "}
            <span className="here">{crumb}</span>
          </div>
          {cashier && showCashierBanner ? <CashierRestrictedBanner /> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
