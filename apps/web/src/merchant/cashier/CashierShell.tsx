import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { AlertsDrawer } from "../../platform/ui/AlertsDrawer";
import { AlertsBellButton } from "../../shared/AlertsBellButton";
import { ThemeToggleButton } from "../../shared/ThemeToggleButton";
import { UnresolvedAlertsBanner } from "../../shared/UnresolvedAlertsBanner";
import { OrgBrandMark } from "../../shared/OrgBrandMark";
import { merchantRoute } from "../../shared/portalRouting";
import { OrgSetupModalHost } from "../../auth/OrgSetupModalHost";
import { SidebarProfileMenu } from "../../auth/SidebarProfileMenu";
import type { OrgAccount, Session } from "../api";
import {
  countUnreadMerchantAlerts,
  initMerchantAlertReads,
  merchantAlertsSource,
  refreshMerchantAlerts,
  subscribeMerchantAlerts,
} from "../merchantAlerts";
import {
  MERCHANT_ORGS_UPDATED_EVENT,
  getMerchantOrgs,
  peekMerchantOrgs,
} from "../merchantOrgList";
import { primaryMerchantOrgId } from "../org";
import { WorkspaceMenuSection } from "../WorkspaceMenuSection";
import { useIdleSignOut } from "./cashierIdle";
import { useCashierWebOrders } from "./cashierPosPolicy";

type Props = {
  session: Session;
  children: ReactNode;
  onSignOut: () => void;
  onSessionRefresh?: (session: Session) => void;
  /** Merchant / site staff using the terminal: show "Back to portal" and skip kiosk idle sign-out. */
  backTo?: string;
};

const TABS = [
  { to: merchantRoute(), label: "Charge", end: true },
  { to: merchantRoute("shift"), label: "My shift", end: false },
  { to: merchantRoute("orders"), label: "Orders", end: false },
];

/** POS-only merchants: no Charge tab; the index route shows My shift. */
const POS_ONLY_TABS = [
  { to: merchantRoute(), label: "My shift", end: true },
  { to: merchantRoute("orders"), label: "Orders", end: false },
];

/** Back-office staff on the terminal: Charge only — Orders live in the portal. */
const PORTAL_TABS = [{ to: merchantRoute("charge"), label: "Charge", end: false }];

/**
 * Cashier terminal chrome — no sidebar. Tablet-first: one top bar with
 * large tabs; owner/admin settings and billing never appear here.
 */
export function CashierShell({
  session,
  children,
  onSignOut,
  onSessionRefresh,
  backTo,
}: Props) {
  const orgId = primaryMerchantOrgId(session);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [orgs, setOrgs] = useState<OrgAccount[] | null>(() => peekMerchantOrgs());
  const org = useMemo(
    () => (orgId ? orgs?.find((o) => o.id === orgId) ?? null : null),
    [orgId, orgs],
  );
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const webOrdersAllowed = useCashierWebOrders(backTo ? null : orgId);
  const tabs = backTo ? PORTAL_TABS : webOrdersAllowed === false ? POS_ONLY_TABS : TABS;
  const idle = useIdleSignOut({ enabled: !backTo, onTimeout: onSignOut });


  useEffect(() => {
    let cancelled = false;
    void getMerchantOrgs()
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
    window.addEventListener(MERCHANT_ORGS_UPDATED_EVENT, onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(MERCHANT_ORGS_UPDATED_EVENT, onUpdated);
    };
  }, [session.userId]);

  useEffect(() => {
    initMerchantAlertReads(session.email);
    const sync = () => setUnreadAlerts(countUnreadMerchantAlerts());
    sync();
    return subscribeMerchantAlerts(sync);
  }, [session.email]);

  // Stable deps only — keep-alive setSession() must not re-arm the 60s poller.
  useEffect(() => {
    const run = async () => {
      if (document.visibilityState !== "visible") return;
      await refreshMerchantAlerts(sessionRef.current);
    };
    void run();
    const interval = window.setInterval(() => void run(), 60_000);
    return () => window.clearInterval(interval);
  }, [orgId, session.userId]);

  useEffect(() => {
    if (alertsOpen) void refreshMerchantAlerts(sessionRef.current);
  }, [alertsOpen]);

  const brandName = org?.name ?? (backTo ? "Merchant" : "Cashier");

  return (
    <div className="shell merchant-shell platform-shell cashier-shell">
      <header className="cashier-shell__bar">
        {backTo ? (
          <Link className="cashier-shell__back" to={backTo}>
            <span aria-hidden>←</span> Back to portal
          </Link>
        ) : null}
        <div className="cashier-shell__brand">
          <OrgBrandMark name={brandName} iconKey={org?.iconKey} size={40} />
          <div className="cashier-shell__brand-copy">
            <p className="cashier-shell__org">{brandName}</p>
            <span className="cashier-shell__tagline">
              {backTo ? "Charge terminal" : "Cashier terminal"}
            </span>
          </div>
        </div>
        <nav className="cashier-shell__tabs" aria-label="Cashier">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `cashier-shell__tab${isActive ? " is-active" : ""}`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <div className="cashier-shell__utils">
          <AlertsBellButton
            open={alertsOpen}
            unreadCount={unreadAlerts}
            onOpen={() => setAlertsOpen(true)}
          />
          <ThemeToggleButton />
          <SidebarProfileMenu
            session={session}
            variant="merchant"
            placement="topbar"
            onSignOut={onSignOut}
            onSessionRefresh={onSessionRefresh}
            menuExtra={(close) => <WorkspaceMenuSection onDone={close} />}
          />
        </div>
      </header>
      {/* Shared list/detail pages portal their filters and actions into these slots. */}
      <div className="cashier-shell__subbar">
        <div className="topbar-leading" id="platform-topbar-leading" />
        <div className="topbar-center-slot" id="platform-topbar-center" />
        <div className="topbar-actions" id="platform-topbar-actions" />
      </div>
      {idle.secondsLeft != null ? (
        <div className="cashier-shell__idle" role="alert">
          <span>
            Signing out in {idle.secondsLeft}s for inactivity.
          </span>
          <button type="button" className="btn-primary btn-sm" onClick={idle.stayActive}>
            Stay signed in
          </button>
        </div>
      ) : null}
      <main className="cashier-shell__main">
        <UnresolvedAlertsBanner
          source={merchantAlertsSource}
          onOpenAlerts={() => setAlertsOpen(true)}
        />
        {onSessionRefresh ? (
          <OrgSetupModalHost
            session={session}
            onSession={onSessionRefresh}
            portal="merchant"
          />
        ) : null}
        {children}
      </main>
      <AlertsDrawer
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        source={merchantAlertsSource}
      />
    </div>
  );
}
