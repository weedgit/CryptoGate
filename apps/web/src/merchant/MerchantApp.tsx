import { useMemo, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
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

function MerchantShellLayout({
  session,
  onSignOut,
  onSessionRefresh,
}: {
  session: Session;
  onSignOut: () => void | Promise<void>;
  onSessionRefresh?: (session: Session) => void;
}) {
  return (
    <RequireMerchantPortal session={session} onSignOut={onSignOut}>
      <MerchantShell
        session={session}
        onSignOut={onSignOut}
        onSessionRefresh={onSessionRefresh}
      >
        <LazyRoute>
          <Outlet />
        </LazyRoute>
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

  if (!session && booting) {
    return <PortalShellBoot />;
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

  const shell = (
    <MerchantShellLayout
      session={session}
      onSignOut={signOut}
      onSessionRefresh={setSession}
    />
  );

  return (
    <Routes>
      <Route element={shell}>
        <Route index element={<DashboardPage session={session} />} />
        <Route
          path="orders/*"
          element={<MerchantOrdersRoutes session={session} />}
        />
        <Route
          path="settings/integrations"
          element={
            <OwnerOnly session={session} area="integrations">
              <IntegrationsPage session={session} />
            </OwnerOnly>
          }
        />
        <Route
          path="settings/settlement"
          element={
            <OwnerOnly session={session} area="settlement settings">
              <SettlementPage session={session} />
            </OwnerOnly>
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
            <OwnerOnly session={session} area="notification settings">
              <NotificationsSettingsPage session={session} />
            </OwnerOnly>
          }
        />
        <Route
          path="settings/team"
          element={
            <OwnerOnly session={session} area="team settings">
              <TeamSettingsPage session={session} />
            </OwnerOnly>
          }
        />
        <Route
          path="networks"
          element={
            <OwnerOnly session={session} area="network catalog">
              <NetworksPage />
            </OwnerOnly>
          }
        />
        <Route
          path="settings/*"
          element={
            <OwnerOnly session={session} area="settings">
              <Navigate to={merchantRoute("settings/team")} replace />
            </OwnerOnly>
          }
        />
        <Route
          path="service-bills"
          element={
            <OwnerOnly session={session} area="service bills">
              <ServiceBillsListPage session={session} />
            </OwnerOnly>
          }
        />
        <Route
          path="service-bills/:id"
          element={
            <OwnerOnly session={session} area="service bills">
              <ServiceBillDetailPage session={session} />
            </OwnerOnly>
          }
        />
        <Route
          path="sites/*"
          element={
            <OwnerOnly session={session} area="sites">
              <MerchantSitesRoutes session={session} />
            </OwnerOnly>
          }
        />
        <Route
          path="reports/*"
          element={
            <OwnerOnly session={session} area="reports">
              <ReportsPage session={session} />
            </OwnerOnly>
          }
        />
        <Route
          path="*"
          element={
            cashier ? (
              <CashierForbiddenPage area="this page" />
            ) : (
              <Navigate to={merchantRoute()} replace />
            )
          }
        />
      </Route>
    </Routes>
  );
}
