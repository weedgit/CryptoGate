import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { OrgAccount, Session } from "./api";
import { SidebarProfileMenu } from "../auth/SidebarProfileMenu";
import { SidebarRoleCard } from "../shared/SidebarRoleCard";
import { AlertsNavIcon } from "../merchant/NavIcons";
import {
  ArchitectureNavIcon,
  DashboardNavIcon,
  CommissionsNavIcon,
  ServiceBillsNavIcon,
  SidebarCollapseIcon,
  TeamNavIcon,
} from "../platform/NavIcons";
import { AlertsDrawer, platformAlertsSource } from "../platform/ui/AlertsDrawer";
import {
  countUnreadPlatformAlerts,
  subscribePlatformAlerts,
} from "../platform/platformAlerts";
import { AlertsBellButton } from "../shared/AlertsBellButton";
import { MobileNavToggle } from "../shared/MobileNavToggle";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import { PortalNav, type PortalNavGroup } from "../shared/PortalNav";
import { ThemeToggleButton } from "../shared/ThemeToggleButton";
import { TopbarSearch } from "../shared/TopbarSearch";
import { UnresolvedAlertsBanner } from "../shared/UnresolvedAlertsBanner";
import { useConditionAlerts } from "../shared/conditionAlerts";
import { clearAgentAlerts, refreshAgentAlerts } from "./agentAlerts";
import { OrgSetupModalHost } from "../auth/OrgSetupModalHost";
import { AgentOrgEditHost } from "./AgentOrgEditHost";
import { ORG_EDIT_PARAM, useOpenOnEditParam } from "../shared/modalLinks";
import { usePortalMobileNav } from "../shared/usePortalMobileNav";
import {
  fetchPlatformHealth,
  syncPlatformHealthAlerts,
} from "../shared/platformHealthAlerts";
import {
  ensureHealthPolling,
  subscribeSharedHealth,
} from "../shared/healthPolling";
import { AGENT_ORGS_UPDATED_EVENT, getAgentOrgs, peekAgentOrgs } from "./agentOrgList";
import { primaryAgentOrgId } from "./org";
import { agentRoute } from "../shared/portalRouting";
import { prefetchAgentRoute } from "./prefetchRoutes";

const SIDEBAR_KEY = "paymentgate.agent.sidebarCollapsed";

const NAV_GROUPS: PortalNavGroup[] = [
  {
    label: "Core systems",
    items: [
      {
        to: agentRoute(),
        label: "Dashboard",
        end: true,
        Icon: DashboardNavIcon,
      },
      {
        to: agentRoute("accounts"),
        label: "Accounts",
        exactActive: true,
        matchPrefixes: [
          agentRoute("accounts"),
          agentRoute("merchants"),
          agentRoute("architecture"),
        ],
        Icon: ArchitectureNavIcon,
        children: [
          {
            to: agentRoute("accounts/merchants"),
            label: "Merchants",
            matchPrefix: agentRoute("accounts/merchants"),
          },
        ],
      },
      {
        to: agentRoute("service-bills"),
        label: "Service Bills",
        matchPrefix: agentRoute("service-bills"),
        Icon: ServiceBillsNavIcon,
      },
      {
        to: agentRoute("commissions"),
        label: "Commissions",
        matchPrefix: agentRoute("commissions"),
        Icon: CommissionsNavIcon,
      },
    ],
  },
  {
    label: "Organization",
    items: [
      {
        to: agentRoute("settings/team"),
        label: "Team",
        matchPrefix: agentRoute("settings/team"),
        Icon: TeamNavIcon,
      },
      {
        to: agentRoute("settings/notifications"),
        label: "Alerts",
        matchPrefix: agentRoute("settings/notifications"),
        Icon: AlertsNavIcon,
      },
    ],
  },
];

type Props = {
  session: Session;
  children: ReactNode;
  onSignOut: () => void;
  onSessionRefresh?: (session: Session) => void;
};

function AgentHealthBeacon() {
  useEffect(() => {
    ensureHealthPolling(true);
    const sync = (next: Awaited<ReturnType<typeof fetchPlatformHealth>>) => {
      syncPlatformHealthAlerts(next);
    };
    const unsub = subscribeSharedHealth(sync);
    void fetchPlatformHealth().then(sync);
    return () => {
      unsub();
      ensureHealthPolling(false);
    };
  }, []);
  return null;
}

export function AgentShell({
  session,
  children,
  onSignOut,
  onSessionRefresh,
}: Props) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  const mainRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const [shellEnter, setShellEnter] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [orgEditOpen, setOrgEditOpen] = useState(false);
  const closeOrgEdit = useCallback(() => setOrgEditOpen(false), []);
  useOpenOnEditParam(ORG_EDIT_PARAM, () => setOrgEditOpen(true));
  useConditionAlerts(session, refreshAgentAlerts, clearAgentAlerts, alertsOpen);
  const agentOrgId = useMemo(() => primaryAgentOrgId(session), [session]);
  const [orgs, setOrgs] = useState<OrgAccount[] | null>(() => peekAgentOrgs());
  const homeOrg = useMemo(
    () => (agentOrgId ? orgs?.find((o) => o.id === agentOrgId) ?? null : null),
    [agentOrgId, orgs],
  );
  const { mobileNavOpen, isTabletOrBelow, closeMobileNav, toggleMobileNav } =
    usePortalMobileNav();
  /** Drawer must show labels even if desktop preference is collapsed. */
  const navCollapsed = collapsed && !isTabletOrBelow;

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setShellEnter(true));
    return () => window.cancelAnimationFrame(id);
  }, []);


  useEffect(() => {
    let cancelled = false;
    void getAgentOrgs()
      .then((rows) => {
        if (!cancelled) setOrgs(rows);
      })
      .catch(() => {
        if (!cancelled) setOrgs((prev) => prev ?? []);
      });
    const onUpdated = (e: Event) => {
      const rows = (e as CustomEvent<OrgAccount[]>).detail;
      if (!cancelled && Array.isArray(rows)) setOrgs(rows);
    };
    window.addEventListener(AGENT_ORGS_UPDATED_EVENT, onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(AGENT_ORGS_UPDATED_EVENT, onUpdated);
    };
  }, [session.userId]);

  useEffect(() => {
    const sync = () => setUnreadAlerts(countUnreadPlatformAlerts());
    sync();
    return subscribePlatformAlerts(sync);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  /** Keep sidebar chrome fixed — wheel over aside scrolls the main pane instead. */
  const onSidebarWheel = (e: ReactWheelEvent<HTMLElement>) => {
    const nav = navRef.current;
    const main = mainRef.current;
    if (!main) return;

    if (nav) {
      const canUp = nav.scrollTop > 0;
      const canDown = nav.scrollTop + nav.clientHeight < nav.scrollHeight - 1;
      const scrollingDown = e.deltaY > 0;
      const scrollingUp = e.deltaY < 0;
      const overNav = nav.contains(e.target as Node);
      if (overNav && ((scrollingDown && canDown) || (scrollingUp && canUp))) {
        return;
      }
    }

    main.scrollTop += e.deltaY;
    e.preventDefault();
  };

  const brandName = homeOrg?.name ?? "Agent";

  return (
    <div
      className={`shell agent-shell platform-shell${navCollapsed ? " platform-shell--collapsed" : ""}${shellEnter ? " is-enter" : ""}${mobileNavOpen ? " portal-shell--nav-open" : ""}`}
    >
      <AgentHealthBeacon />
      <button
        type="button"
        className="portal-nav-backdrop"
        aria-label="Close navigation"
        tabIndex={mobileNavOpen ? 0 : -1}
        onClick={closeMobileNav}
      />
      <aside
        id="portal-sidebar"
        className="sidebar"
        aria-label="Agent navigation"
        onWheel={onSidebarWheel}
      >
        <div className="logo-row">
          <OrgBrandMark
            name={brandName}
            iconKey={homeOrg?.iconKey}
            size={64}
            className="logo-mark"
          />
          {!navCollapsed ? (
            <div className="logo-copy">
              <p className="logo-title">{brandName}</p>
              <span className="logo-tagline">Agent portal</span>
            </div>
          ) : null}
          <button
            type="button"
            className="sidebar-toggle sidebar-toggle--rail"
            aria-label={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!navCollapsed}
            title={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((v) => !v)}
          >
            <SidebarCollapseIcon
              className="sidebar-toggle-icon"
              expanded={!navCollapsed}
            />
          </button>
        </div>
        <PortalNav
          groups={NAV_GROUPS}
          collapsed={navCollapsed}
          ariaLabel="Agent"
          prefetch={prefetchAgentRoute}
          navRef={navRef}
        />
        <div className="sidebar-foot">
          <SidebarRoleCard session={session} portal="agent" collapsed={navCollapsed} />
        </div>
      </aside>
      <div className="main">
        <header className="topbar topbar--chrome">
          <div className="topbar-left">
            <MobileNavToggle open={mobileNavOpen} onToggle={toggleMobileNav} />
            <div className="topbar-leading" id="platform-topbar-leading" />
          </div>
          <div className="topbar-center">
            <TopbarSearch placeholder="Search merchants, sites, accounts..." />
            <div className="topbar-center-slot" id="platform-topbar-center" />
          </div>
          <div className="topbar-right">
            <div className="topbar-actions" id="platform-topbar-actions" />
            <div className="topbar-utils" role="group" aria-label="Utilities">
              <AlertsBellButton
                open={alertsOpen}
                unreadCount={unreadAlerts}
                onOpen={() => setAlertsOpen(true)}
              />
              <ThemeToggleButton />
            </div>
            <span className="topbar-divider" aria-hidden />
            <SidebarProfileMenu
              session={session}
              variant="agent"
              placement="topbar"
              onSignOut={onSignOut}
              onSessionRefresh={onSessionRefresh}
            />
          </div>
        </header>
        <div className="main__scroll" ref={mainRef}>
          <UnresolvedAlertsBanner
            source={platformAlertsSource}
            onOpenAlerts={() => setAlertsOpen(true)}
          />
          <div className="body">
            {onSessionRefresh ? (
              <OrgSetupModalHost
                session={session}
                onSession={onSessionRefresh}
                portal="agent"
              />
            ) : null}
            {children}
          </div>
        </div>
      </div>

      <AgentOrgEditHost
        session={session}
        open={orgEditOpen}
        onClose={closeOrgEdit}
        onSessionRefresh={onSessionRefresh}
      />

      <AlertsDrawer
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        source={platformAlertsSource}
      />
    </div>
  );
}
