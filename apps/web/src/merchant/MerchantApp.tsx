import { useMemo, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { logout, type Session } from "./api";
import { usePortalBoot } from "../auth/usePortalBoot";
import { ForceChangePasswordGate } from "../auth/ForceChangePasswordGate";
import { ForceMfaEnrollmentGate } from "../auth/ForceMfaEnrollmentGate";
import { sessionNeedsForcedMfa } from "../auth/mfaSession";
import { CashierForbiddenPage } from "./CashierForbiddenPage";
import { CreateOrderPage } from "./CreateOrderPage";
import { DashboardPage } from "./DashboardPage";
import { LoginPage } from "./LoginPage";
import { MerchantShell } from "./MerchantShell";
import { OrderDetailPage } from "./OrderDetailPage";
import { OrdersListPage } from "./OrdersListPage";
import { RequireOwnerPortal } from "./RequireOwnerPortal";
import { ReportsPage } from "./ReportsPage";
import { IntegrationsPage } from "./IntegrationsPage";
import { OrganizationSettingsPage } from "./OrganizationSettingsPage";
import { BillingSettingsPage } from "./BillingSettingsPage";
import { NotificationsSettingsPage } from "./NotificationsSettingsPage";
import { TeamSettingsPage } from "./TeamSettingsPage";
import { SettlementPage } from "./SettlementPage";
import { ServiceBillDetailPage } from "./ServiceBillDetailPage";
import { CreateSitePage } from "./CreateSitePage";
import { SiteDetailPage } from "./SiteDetailPage";
import { SitesListPage } from "./SitesListPage";
import { ServiceBillsListPage } from "./ServiceBillsListPage";
import { sessionIsCashierOnly } from "./org";

type ShellProps = {
  session: Session;
  crumb: string;
  children: ReactNode;
  onSignOut: () => void;
  onSessionRefresh?: (session: Session) => void;
  showCashierBanner?: boolean;
  siteLabel?: string | null;
};

function Shell({
  session,
  crumb,
  children,
  onSignOut,
  onSessionRefresh,
  showCashierBanner = false,
  siteLabel = null,
}: ShellProps) {
  return (
    <MerchantShell
      session={session}
      crumb={crumb}
      onSignOut={onSignOut}
      onSessionRefresh={onSessionRefresh}
      showCashierBanner={showCashierBanner}
      siteLabel={siteLabel}
    >
      {children}
    </MerchantShell>
  );
}

function OwnerOnly({
  session,
  area,
  children,
}: {
  session: Session;
  area: string;
  children: ReactNode;
}) {
  return (
    <RequireOwnerPortal session={session} area={area}>
      {children}
    </RequireOwnerPortal>
  );
}

export function MerchantApp() {
  const { session, setSession, mfaPending, booting, completeSignIn } =
    usePortalBoot();

  const cashier = useMemo(
    () => (session ? sessionIsCashierOnly(session) : false),
    [session],
  );

  if (booting) {
    return (
      <div className="login-wrap">
        <p className="login-boot">Loading merchant portal…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <LoginPage startOnMfa={mfaPending} onSignedIn={completeSignIn} />
    );
  }

  if (session.mustChangePassword) {
    return (
      <ForceChangePasswordGate
        session={session}
        portalLabel="Merchant portal"
        onChanged={setSession}
      />
    );
  }

  if (sessionNeedsForcedMfa(session)) {
    return (
      <ForceMfaEnrollmentGate
        session={session}
        portalLabel="Merchant portal"
        onEnrolled={setSession}
      />
    );
  }

  const signOut = async () => {
    await logout();
    setSession(null);
  };


  return (
    <Routes>
      <Route
        index
        element={
          <Shell session={session} crumb="Overview" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <DashboardPage session={session} />
          </Shell>
        }
      />
      <Route
        path="orders"
        element={
          <Shell session={session} crumb="Payment Orders" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <OrdersListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="orders/new"
        element={
          <Shell
            session={session}
            crumb="Generate Invoice Flow"
            onSignOut={signOut}
            onSessionRefresh={setSession}
            showCashierBanner={cashier}
          >
            <CreateOrderPage />
          </Shell>
        }
      />
      <Route
        path="orders/:id"
        element={
          <Shell session={session} crumb="Orders" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <OrderDetailPage />
          </Shell>
        }
      />
      <Route
        path="settings/integrations"
        element={
          <Shell
            session={session}
            crumb="Integrations"
            onSignOut={signOut}
            onSessionRefresh={setSession}
          >
            <OwnerOnly session={session} area="integrations">
              <IntegrationsPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="settings/settlement"
        element={
          <Shell
            session={session}
            crumb="HD Pool & Routing Config"
            onSignOut={signOut}
            onSessionRefresh={setSession}
          >
            <OwnerOnly session={session} area="settlement settings">
              <SettlementPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="settings/organization"
        element={
          <Shell session={session} crumb="Settings" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <OwnerOnly session={session} area="organization settings">
              <OrganizationSettingsPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="settings/billing"
        element={
          <Shell session={session} crumb="Settings" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <OwnerOnly session={session} area="billing settings">
              <BillingSettingsPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="settings/security"
        element={<Navigate to="/merchant" replace />}
      />
      <Route
        path="settings/notifications"
        element={
          <Shell
            session={session}
            crumb="Settings"
            onSignOut={signOut}
            onSessionRefresh={setSession}
          >
            <OwnerOnly session={session} area="notification settings">
              <NotificationsSettingsPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="settings/team"
        element={
          <Shell session={session} crumb="Settings" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <OwnerOnly session={session} area="team settings">
              <TeamSettingsPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="settings/*"
        element={
          <Shell session={session} crumb="Configuration" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <OwnerOnly session={session} area="settings">
              <Navigate to="/merchant/settings/organization" replace />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="service-bills"
        element={
          <Shell session={session} crumb="Platform billing" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <OwnerOnly session={session} area="service bills">
              <ServiceBillsListPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="service-bills/:id"
        element={
          <Shell session={session} crumb="Bill detail" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <OwnerOnly session={session} area="service bills">
              <ServiceBillDetailPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="sites"
        element={
          <Shell session={session} crumb="Locations" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <OwnerOnly session={session} area="sites">
              <SitesListPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="sites/new"
        element={
          <Shell session={session} crumb="Sites" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <OwnerOnly session={session} area="sites">
              <CreateSitePage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="sites/:id"
        element={
          <Shell session={session} crumb="Sites" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <OwnerOnly session={session} area="sites">
              <SiteDetailPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="reports/*"
        element={
          <Shell session={session} crumb="Restricted" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <OwnerOnly session={session} area="reports">
              <ReportsPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="*"
        element={
          cashier ? (
            <Shell session={session} crumb="Portal" onSignOut={signOut}
            onSessionRefresh={setSession}>
              <CashierForbiddenPage area="this page" />
            </Shell>
          ) : (
            <Navigate to="/merchant" replace />
          )
        }
      />
    </Routes>
  );
}
