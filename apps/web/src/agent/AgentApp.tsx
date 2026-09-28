import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useParams,
  useSearchParams,
} from "react-router-dom";
import "../styles/merchant.css";
import "../styles/components.css";
import { logout, type Session } from "./api";
import { invalidateAllPortalDataCaches } from "../shared/portalDataCaches";
import { usePortalBoot } from "../auth/usePortalBoot";
import { ForceChangePasswordGate } from "../auth/ForceChangePasswordGate";
import { ForceMfaEnrollmentGate } from "../auth/ForceMfaEnrollmentGate";
import { sessionNeedsForcedMfa } from "../auth/mfaSession";
import { PortalShellBoot } from "../auth/PortalShellBoot";
import { AgentShell } from "./AgentShell";
import { LoginPage } from "./LoginPage";
import { RequireAgentPortal } from "./RequireAgentPortal";
import { agentRoute } from "../shared/portalRouting";
import { LazyRoute } from "../shared/LazyRoute";
import { lazyNamed } from "../shared/lazyNamed";
import { ORG_EDIT_PARAM, PROFILE_EDIT_PARAM, withEditParam } from "../shared/modalLinks";

function AccountsMerchantRedirect() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const qs = searchParams.toString();
  const target = agentRoute(`accounts/merchants/${id ?? ""}`);
  return <Navigate to={qs ? `${target}?${qs}` : target} replace />;
}

const DashboardPage = lazyNamed(
  () => import("./DashboardPage"),
  "DashboardPage",
);

const CommissionsPage = lazyNamed(
  () => import("./CommissionsPage"),
  "CommissionsPage",
);
const CommissionInvoiceDetailPage = lazyNamed(
  () => import("./CommissionInvoiceDetailPage"),
  "CommissionInvoiceDetailPage",
);
const AgentAccountsRoutes = lazyNamed(
  () => import("./AgentAccountsRoutes"),
  "AgentAccountsRoutes",
);
const ServiceBillDetailPage = lazyNamed(
  () => import("./ServiceBillDetailPage"),
  "ServiceBillDetailPage",
);
const ServiceBillsListPage = lazyNamed(
  () => import("./ServiceBillsListPage"),
  "ServiceBillsListPage",
);
const TeamSettingsPage = lazyNamed(
  () => import("./TeamSettingsPage"),
  "TeamSettingsPage",
);
const AgentNotificationSettingsPage = lazyNamed(
  () => import("./AgentNotificationSettings"),
  "AgentNotificationSettingsPage",
);

function AgentShellLayout({
  session,
  onSignOut,
  onSessionRefresh,
}: {
  session: Session;
  onSignOut: () => void | Promise<void>;
  onSessionRefresh?: (session: Session) => void;
}) {
  return (
    <RequireAgentPortal session={session} onSignOut={onSignOut}>
      <AgentShell
        session={session}
        onSignOut={onSignOut}
        onSessionRefresh={onSessionRefresh}
      >
        <LazyRoute>
          <Outlet />
        </LazyRoute>
      </AgentShell>
    </RequireAgentPortal>
  );
}

export function AgentApp() {
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
      <ForceChangePasswordGate portalLabel="Agent portal" onChanged={setSession} />
    );
  }

  if (sessionNeedsForcedMfa(session)) {
    return (
      <ForceMfaEnrollmentGate
        session={session}
        portalLabel="Agent portal"
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
    <AgentShellLayout
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
          element={<AgentAccountsRoutes session={session} />}
        />
        <Route
          path="accounts/merchants"
          element={<AgentAccountsRoutes session={session} />}
        />
        <Route
          path="accounts/merchants/:id"
          element={<AgentAccountsRoutes session={session} />}
        />
        <Route
          path="accounts/agents/*"
          element={<Navigate to={agentRoute("accounts")} replace />}
        />
        <Route
          path="accounts/:id"
          element={<AgentAccountsRoutes session={session} />}
        />
        <Route
          path="merchants/new"
          element={<AgentAccountsRoutes session={session} />}
        />
        <Route
          path="sites/new"
          element={<AgentAccountsRoutes session={session} />}
        />
        <Route
          path="merchants"
          element={<Navigate to={agentRoute("accounts/merchants")} replace />}
        />
        <Route path="merchants/:id" element={<AccountsMerchantRedirect />} />
        <Route
          path="architecture"
          element={<Navigate to={agentRoute("accounts")} replace />}
        />
        <Route
          path="agents/*"
          element={<Navigate to={agentRoute("accounts")} replace />}
        />
        <Route
          path="settings"
          element={<Navigate to={withEditParam(agentRoute(), ORG_EDIT_PARAM)} replace />}
        />
        <Route path="settings/team" element={<TeamSettingsPage session={session} />} />
        <Route
          path="settings/notifications"
          element={<AgentNotificationSettingsPage session={session} />}
        />
        <Route
          path="settings/security"
          element={<Navigate to={withEditParam(agentRoute(), PROFILE_EDIT_PARAM)} replace />}
        />
        <Route path="commissions" element={<CommissionsPage session={session} />} />
        <Route
          path="commissions/:id"
          element={<CommissionInvoiceDetailPage session={session} />}
        />
        <Route path="service-bills" element={<ServiceBillsListPage session={session} />} />
        <Route path="service-bills/:id" element={<ServiceBillDetailPage session={session} />} />
        <Route path="*" element={<Navigate to={agentRoute()} replace />} />
      </Route>
    </Routes>
  );
}
