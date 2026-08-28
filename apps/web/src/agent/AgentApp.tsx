import { type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { logout, type Session } from "./api";
import { usePortalBoot } from "../auth/usePortalBoot";
import { ForceChangePasswordGate } from "../auth/ForceChangePasswordGate";
import { ForceMfaEnrollmentGate } from "../auth/ForceMfaEnrollmentGate";
import { sessionNeedsForcedMfa } from "../auth/mfaSession";
import { PlatformPending } from "../platform/ui/PlatformPending";
import { AgentShell } from "./AgentShell";
import { AgentSettingsPage } from "./AgentSettingsPage";
import { CommissionsPage } from "./CommissionsPage";
import { DashboardPage } from "./DashboardPage";
import { LoginPage } from "./LoginPage";
import { MerchantsListPage } from "./MerchantsListPage";
import { OnboardMerchantPage } from "./OnboardMerchantPage";
import { OnboardSubAgentPage } from "./OnboardSubAgentPage";
import { RequireAgentOperator, RequireAgentPortal } from "./RequireAgentPortal";
import { ServiceBillDetailPage } from "./ServiceBillDetailPage";
import { ServiceBillsListPage } from "./ServiceBillsListPage";
import { SubAgentsListPage } from "./SubAgentsListPage";
import { ArchitecturePage } from "./ArchitecturePage";
import { TeamSettingsPage } from "./TeamSettingsPage";

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
    <RequireAgentPortal session={session}>
      <AgentShell
        session={session}
        onSignOut={onSignOut}
        onSessionRefresh={onSessionRefresh}
      >
        {children}
      </AgentShell>
    </RequireAgentPortal>
  );
}

export function AgentApp() {
  const { session, setSession, mfaPending, booting, completeSignIn } =
    usePortalBoot();

  if (booting) {
    return (
      <div className="login-wrap">
        <PlatformPending
          title="Loading agent portal"
          copy="Checking session and preparing your workspace."
        />
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
        portalLabel="Agent portal"
        onChanged={setSession}
      />
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
        element={<Navigate to="/agent/settings" replace />}
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
      <Route path="*" element={<Navigate to="/agent" replace />} />
    </Routes>
  );
}
