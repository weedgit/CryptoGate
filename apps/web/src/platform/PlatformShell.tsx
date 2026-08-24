import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { Session } from "./api";
import { sessionIsPlatformViewerOnly } from "./org";

const NAV = [
  { to: "/platform", label: "Dashboard", end: true },
  { to: "/platform/agents", label: "Agents", matchPrefix: "/platform/agents" },
  {
    to: "/platform/merchants",
    label: "Merchants",
    matchPrefix: "/platform/merchants",
  },
  {
    to: "/platform/service-bills",
    label: "Service Bills",
    matchPrefix: "/platform/service-bills",
  },
] as const;

type Props = {
  session: Session;
  title: string;
  crumb: string;
  children: ReactNode;
  onSignOut: () => void;
};

export function PlatformShell({
  session,
  title,
  crumb,
  children,
  onSignOut,
}: Props) {
  const location = useLocation();
  const readOnly = sessionIsPlatformViewerOnly(session);

  return (
    <div className="shell platform-shell">
      <aside className="sidebar">
        <div className="logo-row">
          <div className="logo-mark">CG</div>
          <div>
            <p className="logo-title">CryptoGate</p>
            <span className="logo-badge">PLATFORM ADMIN</span>
          </div>
        </div>
        <div>
          <p className="nav-label">PLATFORM CONTROLS</p>
          <nav className="nav-list">
            {NAV.map((item) => {
              const prefix = "matchPrefix" in item ? item.matchPrefix : undefined;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={"end" in item ? item.end : false}
                  className={({ isActive }) => {
                    const path = location.pathname;
                    const prefixActive =
                      prefix != null && path.startsWith(prefix);
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
          <p>{readOnly ? "Viewer (read-only)" : "Platform operator"}</p>
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
            <span className="net-pill">PLATFORM OPS</span>
            <div className="profile">
              <strong>{session.email}</strong>
              <span>{readOnly ? "Viewer" : "Operator"}</span>
            </div>
          </div>
        </header>
        <div className="body">
          <div className="crumb">
            Platform Console / <span className="here">{crumb}</span>
          </div>
          {readOnly ? (
            <div className="banner banner-warn" style={{ marginBottom: 16 }}>
              Read-only mode — Viewer accounts cannot issue bills or change
              settings.
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
