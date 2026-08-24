import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { Session } from "./api";
import { sessionIsAgentViewerOnly } from "./org";

const NAV = [
  { to: "/agent", label: "Dashboard", end: true },
  { to: "/agent/merchants", label: "Merchants", matchPrefix: "/agent/merchants" },
  { to: "/agent/agents", label: "Sub-agents", matchPrefix: "/agent/agents" },
  {
    to: "/agent/service-bills",
    label: "Service Bills",
    matchPrefix: "/agent/service-bills",
  },
] as const;

type Props = {
  session: Session;
  title: string;
  crumb: string;
  children: ReactNode;
  onSignOut: () => void;
};

export function AgentShell({
  session,
  title,
  crumb,
  children,
  onSignOut,
}: Props) {
  const location = useLocation();
  const readOnly = sessionIsAgentViewerOnly(session);

  return (
    <div className="shell agent-shell">
      <aside className="sidebar">
        <div className="logo-row">
          <div className="logo-mark">CG</div>
          <div>
            <p className="logo-title">CryptoGate</p>
            <span className="logo-badge">AGENT PORTAL</span>
          </div>
        </div>
        <div>
          <p className="nav-label">AGENT CONTROLS</p>
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
          <p>{readOnly ? "Viewer (read-only)" : "Agent operator"}</p>
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
            <span className="net-pill">SUBTREE SCOPE</span>
            <div className="profile">
              <strong>{session.email}</strong>
              <span>{readOnly ? "Viewer" : "Agent"}</span>
            </div>
          </div>
        </header>
        <div className="body">
          <div className="crumb">
            Agent Console / <span className="here">{crumb}</span>
          </div>
          {readOnly ? (
            <div className="banner banner-warn" style={{ marginBottom: 16 }}>
              Read-only mode — Viewer accounts cannot onboard merchants or change
              rates.
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
