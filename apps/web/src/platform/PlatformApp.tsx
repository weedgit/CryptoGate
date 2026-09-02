import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import "../styles/merchant.css";
import "../styles/components.css";
import { logout, type Session } from "./api";
import { usePortalBoot } from "../auth/usePortalBoot";
import { ForceChangePasswordGate } from "../auth/ForceChangePasswordGate";
import { ForceMfaEnrollmentGate } from "../auth/ForceMfaEnrollmentGate";
import { sessionNeedsForcedMfa } from "../auth/mfaSession";
import { LoginPage } from "./LoginPage";
import { PlatformShell } from "./PlatformShell";
import { RequirePlatformPortal } from "./RequirePlatformPortal";
import { PortalShellBoot } from "../auth/PortalShellBoot";
import { platformRoute } from "../shared/portalRouting";
import { LazyRoute } from "../shared/LazyRoute";
import { lazyNamed } from "../shared/lazyNamed";

const DashboardPage = lazyNamed(
  () => import("./DashboardPage"),
  "DashboardPage",
);

const ArchitecturePage = lazyNamed(
  () => import("./ArchitecturePage"),
  "ArchitecturePage",
);
const PlatformMerchantsRoutes = lazyNamed(
  () => import("./PlatformMerchantsRoutes"),
  "PlatformMerchantsRoutes",
);
const PlatformAgentsRoutes = lazyNamed(
  () => import("./PlatformAgentsRoutes"),
  "PlatformAgentsRoutes",
);
const AuditLogPage = lazyNamed(() => import("./AuditLogPage"), "AuditLogPage");
const CompliancePage = lazyNamed(
  () => import("./CompliancePage"),
  "CompliancePage",
);
const FeeTiersSettingsPage = lazyNamed(
  () => import("./FeeTiersSettingsPage"),
  "FeeTiersSettingsPage",
);
const NetworkCatalogPage = lazyNamed(
  () => import("./NetworkCatalogPage"),
  "NetworkCatalogPage",
);
const PlatformTeamPage = lazyNamed(
  () => import("./PlatformTeamPage"),
  "PlatformTeamPage",
);
const ServiceBillDetailPage = lazyNamed(
  () => import("./ServiceBillDetailPage"),
  "ServiceBillDetailPage",
);
const ServiceBillsListPage = lazyNamed(
  () => import("./ServiceBillsListPage"),
  "ServiceBillsListPage",
);
const SystemHealthPage = lazyNamed(
  () => import("./SystemHealthPage"),
  "SystemHealthPage",
);
const PlatformCommissionsPage = lazyNamed(
  () => import("./PlatformCommissionsPage"),
  "PlatformCommissionsPage",
);
const OrderDetailPage = lazyNamed(
  () => import("../merchant/OrderDetailPage"),
  "OrderDetailPage",
);

function PlatformShellLayout({
  session,
  onSignOut,
  onSessionRefresh,
}: {
  session: Session;
  onSignOut: () => void | Promise<void>;
  onSessionRefresh?: (session: Session) => void;
}) {
  return (
    <RequirePlatformPortal session={session} onSignOut={onSignOut}>
      <PlatformShell
        session={session}
        onSignOut={onSignOut}
        onSessionRefresh={onSessionRefresh}
      >
        <LazyRoute>
          <Outlet />
        </LazyRoute>
      </PlatformShell>
    </RequirePlatformPortal>
  );
}

export function PlatformApp() {
  const { session, setSession, mfaPending, booting, completeSignIn } =
    usePortalBoot();

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
        portalLabel="Platform portal"
        onEnrolled={setSession}
      />
    );
  }

  const signOut = async () => {
    await logout();
    setSession(null);
  };

  const shell = (
    <PlatformShellLayout
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
          path="agents"
          element={<PlatformAgentsRoutes session={session} />}
        />
        <Route
          path="agents/new"
          element={<PlatformAgentsRoutes session={session} />}
        />
        <Route
          path="agents/:id"
          element={<PlatformAgentsRoutes session={session} />}
        />
        <Route
          path="merchants"
          element={<PlatformMerchantsRoutes session={session} />}
        />
        <Route
          path="merchants/new"
          element={<PlatformMerchantsRoutes session={session} />}
        />
        <Route
          path="merchants/:id"
          element={<PlatformMerchantsRoutes session={session} />}
        />
        <Route
          path="architecture"
          element={<ArchitecturePage session={session} />}
        />
        <Route
          path="service-bills/new"
          element={
            <Navigate
              to={`${platformRoute("service-bills")}?issue=1`}
              replace
            />
          }
        />
        <Route path="service-bills" element={<ServiceBillsListPage session={session} />} />
        <Route
          path="service-bills/:id"
          element={<ServiceBillDetailPage session={session} />}
        />
        <Route
          path="commissions"
          element={<PlatformCommissionsPage session={session} />}
        />
        <Route path="audit" element={<AuditLogPage />} />
        <Route
          path="orders/:id"
          element={<OrderDetailPage session={session} variant="platform" />}
        />
        <Route path="compliance" element={<CompliancePage />} />
        <Route path="settings" element={<Navigate to={platformRoute()} replace />} />
        <Route
          path="settings/security"
          element={<Navigate to={platformRoute()} replace />}
        />
        <Route
          path="settings/fee-tiers"
          element={<FeeTiersSettingsPage session={session} />}
        />
        <Route
          path="settings/billing-wallet"
          element={
            <Navigate
              to={`${platformRoute("settings/fee-tiers")}?tab=remittance`}
              replace
            />
          }
        />
        <Route
          path="settings/networks"
          element={<NetworkCatalogPage session={session} />}
        />
        <Route path="settings/team" element={<PlatformTeamPage session={session} />} />
        <Route path="ops/health" element={<SystemHealthPage />} />
        <Route path="*" element={<Navigate to={platformRoute()} replace />} />
      </Route>
    </Routes>
  );
}
