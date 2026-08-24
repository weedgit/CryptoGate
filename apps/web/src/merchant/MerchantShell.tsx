import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { Session } from "./api";

const NAV = [
  { to: "/merchant", label: "Dashboard", end: true },
  { to: "/merchant/orders", label: "Orders", matchPrefix: "/merchant/orders" },
  { to: "/merchant/service-bills", label: "Service Bills" },
  { to: "/merchant/sites", label: "Sites" },
  { to: "/merchant/reports", label: "Reports" },
  { to: "/merchant/settings/settlement", label: "Settlement" },
  { to: "/merchant/settings/organization", label: "Org" },
  { to: "/merchant/settings/team", label: "Team" },
] as const;

type Props = {
  session: Session;
  title: string;
  crumb: string;
  children: ReactNode;
  onSignOut: () => void;
};

export function MerchantShell({ session, title, crumb, children, onSignOut }: Props) {
  const location = useLocation();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo-row">
          <div className="logo-mark">CG</div>
          <div>
            <p className="logo-title">CryptoGate</p>
            <span className="logo-badge">OWNER PORTAL</span>
          </div>
        </div>
        <div>
          <p className="nav-label">PORTAL CONTROLS</p>
          <nav className="nav-list">
            {NAV.map((item) => {
              const prefix =
                "matchPrefix" in item ? item.matchPrefix : undefined;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={"end" in item ? item.end : false}
                  className={({ isActive }) => {
                    const active =
                      isActive ||
                      (prefix ? location.pathname.startsWith(prefix) : false);
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
          <p>
            <button
              type="button"
              onClick={onSignOut}
              style={{
                background: "transparent",
                border: 0,
                color: "var(--footer)",
                cursor: "pointer",
                padding: 0,
                font: "inherit",
              }}
            >
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
              <span>Merchant</span>
            </div>
          </div>
        </header>
        <div className="body">
          <div className="crumb">
            Merchant Terminal / <span className="here">{crumb}</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
