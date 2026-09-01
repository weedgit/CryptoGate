import { type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
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

type ShellProps = {
  session: Session;
  children: ReactNode;
  onSignOut: () => void;
  onSessionRefresh?: (session: Session) => void;
};

function Shell({
  session,
  children,
  onSignOut,
  onSessionRefresh,
}: ShellProps) {
  return (
    <RequireAgentPortal session={session} onSignOut={onSignOut}>
      <AgentShell
        session={session}
        onSignOut={onSignOut}
        onSessionRefresh={onSessionRefresh}
      >
        <LazyRoute>{children}</LazyRoute>
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
        path="merchants"
        element={
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <MerchantsListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="merchants/new"
        element={
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <RequireAgentOperator session={session}>
              <OnboardMerchantPage session={session} />
            </RequireAgentOperator>
          </Shell>
        }
      />
      <Route
        path="merchants/:id"
        element={
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <MerchantsListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="architecture"
        element={
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <ArchitecturePage session={session} />
          </Shell>
        }
      />
      <Route
        path="agents/new"
        element={
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <RequireAgentOperator session={session}>
              <OnboardSubAgentPage session={session} />
            </RequireAgentOperator>
          </Shell>
        }
      />
      <Route
        path="agents/:id"
        element={
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <SubAgentsListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="agents"
        element={
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <SubAgentsListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="settings"
        element={
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <AgentSettingsPage session={session} />
          </Shell>
        }
      />
      <Route
        path="settings/team"
        element={
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <TeamSettingsPage session={session} />
          </Shell>
        }
      />
      <Route
        path="settings/security"
        element={<Navigate to={agentRoute("settings")} replace />}
      />
      <Route
        path="commissions"
        element={
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <CommissionsPage session={session} />
          </Shell>
        }
      />
      <Route
        path="service-bills"
        element={
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <ServiceBillsListPage />
          </Shell>
        }
      />
      <Route
        path="service-bills/:id"
        element={
          <Shell session={session} onSignOut={signOut}
            onSessionRefresh={setSession}>
            <ServiceBillDetailPage />
          </Shell>
        }
      />
      <Route path="*" element={<Navigate to={agentRoute()} replace />} />
    </Routes>
  );
}
