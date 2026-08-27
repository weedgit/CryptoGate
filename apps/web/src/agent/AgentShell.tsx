import type { ComponentType, ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { Session } from "./api";
import {
  AgentsNavIcon,
  AuditLogNavIcon,
  DashboardNavIcon,
  MerchantsNavIcon,
  SecurityNavIcon,
  ServiceBillsNavIcon,
  SignOutNavIcon,
  TeamNavIcon,
} from "../platform/NavIcons";
import { sessionIsAgentViewerOnly } from "./org";

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  matchPrefix?: string;
  Icon: ComponentType<{ className?: string }>;
};

const NAV: NavItem[] = [
  { to: "/agent", label: "Dashboard", end: true, Icon: DashboardNavIcon },
  {
    to: "/agent/merchants",
    label: "Merchants",
    matchPrefix: "/agent/merchants",
    Icon: MerchantsNavIcon,
  },
  {
    to: "/agent/agents",
    label: "Sub-agents",
    matchPrefix: "/agent/agents",
    Icon: AgentsNavIcon,
  },
  {
    to: "/agent/service-bills",
    label: "Service Bills",
    matchPrefix: "/agent/service-bills",
    Icon: ServiceBillsNavIcon,
  },
  {
    to: "/agent/commissions",
    label: "Commissions",
    matchPrefix: "/agent/commissions",
    Icon: AuditLogNavIcon,
  },
  {
    to: "/agent/settings/team",
    label: "Team",
    matchPrefix: "/agent/settings/team",
    Icon: TeamNavIcon,
  },
  {
    to: "/agent/settings/security",
    label: "Security",
    matchPrefix: "/agent/settings/security",
    Icon: SecurityNavIcon,
  },
];

type Props = {
  session: Session;
  title?: string;
  crumb?: string;
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
    <div className="shell agent-shell platform-shell">
      <aside className="sidebar">
        <div className="logo-row">
          <div className="logo-mark">CG</div>
          <div>
            <p className="logo-title">CryptoGate</p>
            <span className="logo-badge">AGENT PORTAL</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="Agent">
          <div className="nav-group">
            <p className="nav-label">Agent controls</p>
            {NAV.map((item) => {
              const { Icon } = item;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end ?? false}
                  className={({ isActive }) => {
                    const path = location.pathname;
                    const prefixActive =
                      item.matchPrefix != null &&
                      path.startsWith(item.matchPrefix);
                    const active = isActive || prefixActive;
                    return `nav-item${active ? " active" : ""}`;
                  }}
                >
                  <Icon />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>
        <div className="sidebar-foot">
          <p>SESSION // {session.email.split("@")[0]}</p>
          <p>{readOnly ? "Viewer (read-only)" : "Agent operator"}</p>
          <p>
            <button type="button" className="sign-out-btn" onClick={onSignOut}>
              <SignOutNavIcon className="sign-out-icon" />
              <span>Sign out</span>
            </button>
          </p>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            {title ? <h1>{title}</h1> : null}
          </div>
          <div className="topbar-center" id="agent-topbar-center" />
          <div className="topbar-right">
            <span className="net-pill">SUBTREE SCOPE</span>
            <div className="profile">
              <strong>{session.email.split("@")[0]}</strong>
              <span>{readOnly ? "Viewer" : "Agent Executive"}</span>
            </div>
          </div>
        </header>
        <div className="body">
          {crumb ? (
            <div className="crumb">
              Agent Console / <span className="here">{crumb}</span>
            </div>
          ) : null}
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
