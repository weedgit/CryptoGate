import { useMemo, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import "../styles/merchant.css";
import "../styles/components.css";
import { logout, type Session } from "./api";
import { PortalShellBoot } from "../auth/PortalShellBoot";
import { usePortalBoot } from "../auth/usePortalBoot";
import { ForceChangePasswordGate } from "../auth/ForceChangePasswordGate";
import { ForceMfaEnrollmentGate } from "../auth/ForceMfaEnrollmentGate";
import { sessionNeedsForcedMfa } from "../auth/mfaSession";
import { LoginPage } from "./LoginPage";
import { MerchantShell } from "./MerchantShell";
import { RequireOwnerPortal } from "./RequireOwnerPortal";
import { RequireMerchantPortal } from "./RequireMerchantPortal";
import { CashierForbiddenPage } from "./CashierForbiddenPage";
import { sessionIsCashierOnly } from "./org";
import { merchantRoute } from "../shared/portalRouting";
import { LazyRoute } from "../shared/LazyRoute";
import { lazyNamed } from "../shared/lazyNamed";

const DashboardPage = lazyNamed(
  () => import("./DashboardPage"),
  "DashboardPage",
);
const NetworksPage = lazyNamed(() => import("./NetworksPage"), "NetworksPage");
const MerchantOrdersRoutes = lazyNamed(
  () => import("./MerchantOrdersRoutes"),
  "MerchantOrdersRoutes",
);
const OrderDetailPage = lazyNamed(
  () => import("./OrderDetailPage"),
  "OrderDetailPage",
);
const OrdersListPage = lazyNamed(
  () => import("./OrdersListPage"),
  "OrdersListPage",
);
const ReportsPage = lazyNamed(() => import("./ReportsPage"), "ReportsPage");
const IntegrationsPage = lazyNamed(
  () => import("./IntegrationsPage"),
  "IntegrationsPage",
);
const NotificationsSettingsPage = lazyNamed(
  () => import("./NotificationsSettingsPage"),
  "NotificationsSettingsPage",
);
const TeamSettingsPage = lazyNamed(
  () => import("./TeamSettingsPage"),
  "TeamSettingsPage",
);
const SettlementPage = lazyNamed(
  () => import("./SettlementPage"),
  "SettlementPage",
);
const ServiceBillDetailPage = lazyNamed(
  () => import("./ServiceBillDetailPage"),
  "ServiceBillDetailPage",
);
const MerchantSitesRoutes = lazyNamed(
  () => import("./MerchantSitesRoutes"),
  "MerchantSitesRoutes",
);
const ServiceBillsListPage = lazyNamed(
  () => import("./ServiceBillsListPage"),
  "ServiceBillsListPage",
);

type ShellProps = {
  session: Session;
  children: ReactNode;
  onSignOut: () => void;
  onSessionRefresh?: (session: Session) => void;
  showCashierBanner?: boolean;
};

function Shell({
  session,
  children,
  onSignOut,
  onSessionRefresh,
  showCashierBanner = false,
}: ShellProps) {
  return (
    <RequireMerchantPortal session={session} onSignOut={onSignOut}>
      <MerchantShell
        session={session}
        onSignOut={onSignOut}
        onSessionRefresh={onSessionRefresh}
        showCashierBanner={showCashierBanner}
      >
        <LazyRoute>{children}</LazyRoute>
      </MerchantShell>
    </RequireMerchantPortal>
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
      <PortalShellBoot
        title="Loading merchant portal"
        copy="Verifying your session"
      />
    );
  }

  if (!session) {
    return (
      <LoginPage startOnMfa={mfaPending} onSignedIn={completeSignIn} />
    );
  }

  if (session.mustChangePassword) {
    return (
      <ForceChangePasswordGate onChanged={setSession} />
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
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <DashboardPage session={session} />
          </Shell>
        }
      />
      <Route
        path="orders"
        element={
          <Shell session={session} onSignOut={signOut}
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
            onSignOut={signOut}
            onSessionRefresh={setSession}
            showCashierBanner={cashier}
          >
            <MerchantOrdersRoutes session={session} showCreateModal />
          </Shell>
        }
      />
      <Route
        path="orders/:id"
        element={
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <OrderDetailPage session={session} />
          </Shell>
        }
      />
      <Route
        path="settings/integrations"
        element={
          <Shell
            session={session}
           
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
        element={<Navigate to={merchantRoute("settings/team")} replace />}
      />
      <Route
        path="settings/billing"
        element={<Navigate to={merchantRoute("service-bills")} replace />}
      />
      <Route
        path="settings/security"
        element={<Navigate to={merchantRoute()} replace />}
      />
      <Route
        path="settings/notifications"
        element={
          <Shell
            session={session}
           
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
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <OwnerOnly session={session} area="team settings">
              <TeamSettingsPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="networks"
        element={
          <Shell session={session} onSignOut={signOut} onSessionRefresh={setSession}>
            <OwnerOnly session={session} area="network catalog">
              <NetworksPage />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="settings/*"
        element={
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <OwnerOnly session={session} area="settings">
              <Navigate to={merchantRoute("settings/team")} replace />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="service-bills"
        element={
          <Shell session={session} onSignOut={signOut}
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
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <OwnerOnly session={session} area="service bills">
              <ServiceBillDetailPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="sites/*"
        element={
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <OwnerOnly session={session} area="sites">
              <MerchantSitesRoutes session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="reports/*"
        element={
          <Shell session={session} onSignOut={signOut}
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
            <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
              <CashierForbiddenPage area="this page" />
            </Shell>
          ) : (
            <Navigate to={merchantRoute()} replace />
          )
        }
      />
    </Routes>
  );
}
