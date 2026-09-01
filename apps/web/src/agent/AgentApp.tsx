import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import "../styles/merchant.css";
import "../styles/components.css";
import { logout, type Session } from "./api";
import { usePortalBoot } from "../auth/usePortalBoot";
import { ForceChangePasswordGate } from "../auth/ForceChangePasswordGate";
import { ForceMfaEnrollmentGate } from "../auth/ForceMfaEnrollmentGate";
import { sessionNeedsForcedMfa } from "../auth/mfaSession";
import { PortalShellBoot } from "../auth/PortalShellBoot";
import { AgentShell } from "./AgentShell";
import { LoginPage } from "./LoginPage";
import { RequireAgentOperator, RequireAgentPortal } from "./RequireAgentPortal";
import { agentRoute } from "../shared/portalRouting";
import { LazyRoute } from "../shared/LazyRoute";
import { lazyNamed } from "../shared/lazyNamed";

const DashboardPage = lazyNamed(
  () => import("./DashboardPage"),
  "DashboardPage",
);

const AgentSettingsPage = lazyNamed(
  () => import("./AgentSettingsPage"),
  "AgentSettingsPage",
);
const CommissionsPage = lazyNamed(
  () => import("./CommissionsPage"),
  "CommissionsPage",
);
const MerchantsListPage = lazyNamed(
  () => import("./MerchantsListPage"),
  "MerchantsListPage",
);
const OnboardMerchantPage = lazyNamed(
  () => import("./OnboardMerchantPage"),
  "OnboardMerchantPage",
);
const OnboardSubAgentPage = lazyNamed(
  () => import("./OnboardSubAgentPage"),
  "OnboardSubAgentPage",
);
const ServiceBillDetailPage = lazyNamed(
  () => import("./ServiceBillDetailPage"),
  "ServiceBillDetailPage",
);
const ServiceBillsListPage = lazyNamed(
  () => import("./ServiceBillsListPage"),
  "ServiceBillsListPage",
);
const SubAgentsListPage = lazyNamed(
  () => import("./SubAgentsListPage"),
  "SubAgentsListPage",
);
const ArchitecturePage = lazyNamed(
  () => import("./ArchitecturePage"),
  "ArchitecturePage",
);
const TeamSettingsPage = lazyNamed(
  () => import("./TeamSettingsPage"),
  "TeamSettingsPage",
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

  if (booting) {
    return (
      <PortalShellBoot
        title="Loading agent portal"
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
        portalLabel="Agent portal"
        onEnrolled={setSession}
      />
    );
  }

  const signOut = async () => {
    await logout();
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
        <Route path="merchants" element={<MerchantsListPage session={session} />} />
        <Route
          path="merchants/new"
          element={
            <RequireAgentOperator session={session}>
              <OnboardMerchantPage session={session} />
            </RequireAgentOperator>
          }
        />
        <Route
          path="merchants/:id"
          element={<MerchantsListPage session={session} />}
        />
        <Route
          path="architecture"
          element={<ArchitecturePage session={session} />}
        />
        <Route
          path="agents/new"
          element={
            <RequireAgentOperator session={session}>
              <OnboardSubAgentPage session={session} />
            </RequireAgentOperator>
          }
        />
        <Route path="agents/:id" element={<SubAgentsListPage session={session} />} />
        <Route path="agents" element={<SubAgentsListPage session={session} />} />
        <Route path="settings" element={<AgentSettingsPage session={session} />} />
        <Route path="settings/team" element={<TeamSettingsPage session={session} />} />
        <Route
          path="settings/security"
          element={<Navigate to={agentRoute("settings")} replace />}
        />
        <Route path="commissions" element={<CommissionsPage session={session} />} />
        <Route path="service-bills" element={<ServiceBillsListPage />} />
        <Route path="service-bills/:id" element={<ServiceBillDetailPage />} />
        <Route path="*" element={<Navigate to={agentRoute()} replace />} />
      </Route>
    </Routes>
  );
}
