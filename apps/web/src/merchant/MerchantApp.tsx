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
import { SecuritySettingsPage } from "./SecuritySettingsPage";
import { SettlementPage } from "./SettlementPage";
import { ServiceBillDetailPage } from "./ServiceBillDetailPage";
import { CreateSitePage } from "./CreateSitePage";
import { SiteDetailPage } from "./SiteDetailPage";
import { SitesListPage } from "./SitesListPage";
import { ServiceBillsListPage } from "./ServiceBillsListPage";
import { sessionIsCashierOnly } from "./org";

type ShellProps = {
  session: Session;
  title: string;
  crumb: string;
  children: ReactNode;
  onSignOut: () => void;
  showCashierBanner?: boolean;
  siteLabel?: string | null;
};

function Shell({
  session,
  title,
  crumb,
  children,
  onSignOut,
  showCashierBanner = false,
  siteLabel = null,
}: ShellProps) {
  return (
    <MerchantShell
      session={session}
      title={title}
      crumb={crumb}
      onSignOut={onSignOut}
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

  const dashTitle = cashier ? "Cashier Dashboard" : "Merchant Dashboard";
  const ordersTitle = cashier ? "My Orders" : "Orders Directory";
  const createTitle = cashier ? "Payment Request Terminal" : "New Payment Request";

  return (
    <Routes>
      <Route
        index
        element={
          <Shell session={session} title={dashTitle} crumb="Overview" onSignOut={signOut}>
            <DashboardPage session={session} />
          </Shell>
        }
      />
      <Route
        path="orders"
        element={
          <Shell session={session} title={ordersTitle} crumb="Payment Orders" onSignOut={signOut}>
            <OrdersListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="orders/new"
        element={
          <Shell
            session={session}
            title={createTitle}
            crumb="Generate Invoice Flow"
            onSignOut={signOut}
            showCashierBanner={cashier}
          >
            <CreateOrderPage />
          </Shell>
        }
      />
      <Route
        path="orders/:id"
        element={
          <Shell session={session} title="Order Insights" crumb="Orders" onSignOut={signOut}>
            <OrderDetailPage />
          </Shell>
        }
      />
      <Route
        path="settings/integrations"
        element={
          <Shell
            session={session}
            title="API Keys & Webhooks"
            crumb="Integrations"
            onSignOut={signOut}
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
            title="Settlement Protocol & Address Book"
            crumb="HD Pool & Routing Config"
            onSignOut={signOut}
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
          <Shell session={session} title="Organization" crumb="Settings" onSignOut={signOut}>
            <OwnerOnly session={session} area="organization settings">
              <OrganizationSettingsPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="settings/billing"
        element={
          <Shell session={session} title="Fee & Billing" crumb="Settings" onSignOut={signOut}>
            <OwnerOnly session={session} area="billing settings">
              <BillingSettingsPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="settings/security"
        element={
          <Shell session={session} title="Security" crumb="Settings" onSignOut={signOut}>
            <OwnerOnly session={session} area="security settings">
              <SecuritySettingsPage
                session={session}
                onSessionRefresh={setSession}
              />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="settings/notifications"
        element={
          <Shell
            session={session}
            title="Notifications"
            crumb="Settings"
            onSignOut={signOut}
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
          <Shell session={session} title="Team" crumb="Settings" onSignOut={signOut}>
            <OwnerOnly session={session} area="team settings">
              <TeamSettingsPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="settings/*"
        element={
          <Shell session={session} title="Settings" crumb="Configuration" onSignOut={signOut}>
            <OwnerOnly session={session} area="settings">
              <Navigate to="/merchant/settings/organization" replace />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="service-bills"
        element={
          <Shell session={session} title="Service Bills" crumb="Platform billing" onSignOut={signOut}>
            <OwnerOnly session={session} area="service bills">
              <ServiceBillsListPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="service-bills/:id"
        element={
          <Shell session={session} title="Service Bill" crumb="Bill detail" onSignOut={signOut}>
            <OwnerOnly session={session} area="service bills">
              <ServiceBillDetailPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="sites"
        element={
          <Shell session={session} title="Sites" crumb="Locations" onSignOut={signOut}>
            <OwnerOnly session={session} area="sites">
              <SitesListPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="sites/new"
        element={
          <Shell session={session} title="Add Site" crumb="Sites" onSignOut={signOut}>
            <OwnerOnly session={session} area="sites">
              <CreateSitePage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="sites/:id"
        element={
          <Shell session={session} title="Site Detail" crumb="Sites" onSignOut={signOut}>
            <OwnerOnly session={session} area="sites">
              <SiteDetailPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="reports/*"
        element={
          <Shell session={session} title="Reports" crumb="Restricted" onSignOut={signOut}>
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
            <Shell session={session} title="Merchant" crumb="Portal" onSignOut={signOut}>
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
