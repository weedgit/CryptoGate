import { type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { logout, type Session } from "./api";
import { usePortalBoot } from "../auth/usePortalBoot";
import { ForceChangePasswordGate } from "../auth/ForceChangePasswordGate";
import { ForceMfaEnrollmentGate } from "../auth/ForceMfaEnrollmentGate";
import { sessionNeedsForcedMfa } from "../auth/mfaSession";
import { AgentShell } from "./AgentShell";
import { CommissionsPage } from "./CommissionsPage";
import { DashboardPage } from "./DashboardPage";
import { LoginPage } from "./LoginPage";
import { MerchantDetailPage } from "./MerchantDetailPage";
import { MerchantsListPage } from "./MerchantsListPage";
import { OnboardMerchantPage } from "./OnboardMerchantPage";
import { RequireAgentOperator, RequireAgentPortal } from "./RequireAgentPortal";
import { ServiceBillDetailPage } from "./ServiceBillDetailPage";
import { ServiceBillsListPage } from "./ServiceBillsListPage";
import { SubAgentsListPage } from "./SubAgentsListPage";
import { TeamSettingsPage } from "./TeamSettingsPage";

type ShellProps = {
  session: Session;
  crumb?: string;
  children: ReactNode;
  onSignOut: () => void;
  onSessionRefresh?: (session: Session) => void;
};

function Shell({
  session,
  crumb,
  children,
  onSignOut,
  onSessionRefresh,
}: ShellProps) {
  return (
    <RequireAgentPortal session={session}>
      <AgentShell
        session={session}
        crumb={crumb}
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
        <p style={{ color: "var(--muted)" }}>Loading…</p>
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
          <Shell session={session} crumb="Subtree" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <MerchantsListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="merchants/new"
        element={
          <Shell session={session} crumb="Merchants" onSignOut={signOut}
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
          <Shell session={session} crumb="Merchants" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <MerchantDetailPage />
          </Shell>
        }
      />
      <Route
        path="agents"
        element={
          <Shell session={session} crumb="Agents" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <SubAgentsListPage />
          </Shell>
        }
      />
      <Route
        path="settings/team"
        element={
          <Shell session={session} crumb="Settings" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <TeamSettingsPage session={session} />
          </Shell>
        }
      />
      <Route
        path="settings/security"
        element={<Navigate to="/agent" replace />}
      />
      <Route
        path="commissions"
        element={
          <Shell session={session} crumb="Billing" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <CommissionsPage session={session} />
          </Shell>
        }
      />
      <Route
        path="service-bills"
        element={
          <Shell session={session} crumb="Billing" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <ServiceBillsListPage />
          </Shell>
        }
      />
      <Route
        path="service-bills/:id"
        element={
          <Shell session={session} crumb="Billing" onSignOut={signOut}
            onSessionRefresh={setSession}>
            <ServiceBillDetailPage />
          </Shell>
        }
      />
      <Route path="*" element={<Navigate to="/agent" replace />} />
    </Routes>
  );
}
