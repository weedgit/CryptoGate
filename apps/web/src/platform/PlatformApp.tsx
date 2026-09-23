import { Navigate, Outlet, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import "../styles/merchant.css";
import "../styles/components.css";
import { logout, type Session } from "./api";
import { invalidateAllPortalDataCaches } from "../shared/portalDataCaches";
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

function AccountsOrgRedirect({ kind }: { kind: "agents" | "merchants" }) {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const qs = searchParams.toString();
  const target = platformRoute(`accounts/${kind}/${id ?? ""}`);
  return <Navigate to={qs ? `${target}?${qs}` : target} replace />;
}

const DashboardPage = lazyNamed(
  () => import("./DashboardPage"),
  "DashboardPage",
);

const PlatformAccountsRoutes = lazyNamed(
  () => import("./PlatformAccountsRoutes"),
  "PlatformAccountsRoutes",
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
const RatesPricingSettingsPage = lazyNamed(
  () => import("./RatesPricingSettingsPage"),
  "RatesPricingSettingsPage",
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
    invalidateAllPortalDataCaches();
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
          path="accounts"
          element={<PlatformAccountsRoutes session={session} />}
        />
        <Route
          path="accounts/agents"
          element={<PlatformAccountsRoutes session={session} />}
        />
        <Route
          path="accounts/agents/:id"
          element={<PlatformAccountsRoutes session={session} />}
        />
        <Route
          path="accounts/merchants"
          element={<PlatformAccountsRoutes session={session} />}
        />
        <Route
          path="accounts/merchants/:id"
          element={<PlatformAccountsRoutes session={session} />}
        />
        <Route
          path="accounts/:id"
          element={<PlatformAccountsRoutes session={session} />}
        />
        <Route
          path="agents/new"
          element={<PlatformAccountsRoutes session={session} />}
        />
        <Route
          path="merchants/new"
          element={<PlatformAccountsRoutes session={session} />}
        />
        <Route
          path="sites/new"
          element={<PlatformAccountsRoutes session={session} />}
        />
        <Route
          path="architecture"
          element={<Navigate to={platformRoute("accounts")} replace />}
        />
        <Route
          path="agents"
          element={<Navigate to={platformRoute("accounts/agents")} replace />}
        />
        <Route
          path="agents/:id"
          element={<AccountsOrgRedirect kind="agents" />}
        />
        <Route
          path="merchants"
          element={<Navigate to={platformRoute("accounts/merchants")} replace />}
        />
        <Route
          path="merchants/:id"
          element={<AccountsOrgRedirect kind="merchants" />}
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
          path="settings/rates"
          element={<RatesPricingSettingsPage session={session} />}
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
        <Route
          path="ops/health"
          element={<Navigate to={platformRoute("settings/networks")} replace />}
        />
        <Route path="*" element={<Navigate to={platformRoute()} replace />} />
      </Route>
    </Routes>
  );
}
