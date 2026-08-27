import { type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { logout, type Session } from "./api";
import { usePortalBoot } from "../auth/usePortalBoot";
import { ForceChangePasswordGate } from "../auth/ForceChangePasswordGate";
import { ForceMfaEnrollmentGate } from "../auth/ForceMfaEnrollmentGate";
import { sessionNeedsForcedMfa } from "../auth/mfaSession";
import { SecuritySettingsPage } from "../auth/SecuritySettingsPage";
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
  title?: string;
  crumb?: string;
  children: ReactNode;
  onSignOut: () => void;
};

function Shell({ session, title, crumb, children, onSignOut }: ShellProps) {
  return (
    <RequireAgentPortal session={session}>
      <AgentShell
        session={session}
        title={title}
        crumb={crumb}
        onSignOut={onSignOut}
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
          <Shell
            session={session}
            onSignOut={signOut}
          >
            <DashboardPage session={session} />
          </Shell>
        }
      />
      <Route
        path="merchants"
        element={
          <Shell
            session={session}
            title="Merchants"
            crumb="Subtree"
            onSignOut={signOut}
          >
            <MerchantsListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="merchants/new"
        element={
          <Shell
            session={session}
            title="Onboard Merchant"
            crumb="Merchants"
            onSignOut={signOut}
          >
            <RequireAgentOperator session={session}>
              <OnboardMerchantPage session={session} />
            </RequireAgentOperator>
          </Shell>
        }
      />
      <Route
        path="merchants/:id"
        element={
          <Shell
            session={session}
            title="Merchant Detail"
            crumb="Merchants"
            onSignOut={signOut}
          >
            <MerchantDetailPage />
          </Shell>
        }
      />
      <Route
        path="agents"
        element={
          <Shell
            session={session}
            title="Sub-agents"
            crumb="Agents"
            onSignOut={signOut}
          >
            <SubAgentsListPage />
          </Shell>
        }
      />
      <Route
        path="settings/team"
        element={
          <Shell
            session={session}
            title="Team"
            crumb="Settings"
            onSignOut={signOut}
          >
            <TeamSettingsPage session={session} />
          </Shell>
        }
      />
      <Route
        path="settings/security"
        element={
          <Shell
            session={session}
            title="Security"
            crumb="Settings"
            onSignOut={signOut}
          >
            <SecuritySettingsPage
              session={session}
              variant="agent"
              onSessionRefresh={setSession}
            />
          </Shell>
        }
      />
      <Route
        path="commissions"
        element={
          <Shell
            session={session}
            title="Commissions"
            crumb="Billing"
            onSignOut={signOut}
          >
            <CommissionsPage session={session} />
          </Shell>
        }
      />
      <Route
        path="service-bills"
        element={
          <Shell
            session={session}
            title="Service Bills"
            crumb="Billing"
            onSignOut={signOut}
          >
            <ServiceBillsListPage />
          </Shell>
        }
      />
      <Route
        path="service-bills/:id"
        element={
          <Shell
            session={session}
            title="Service Bill"
            crumb="Billing"
            onSignOut={signOut}
          >
            <ServiceBillDetailPage />
          </Shell>
        }
      />
      <Route path="*" element={<Navigate to="/agent" replace />} />
    </Routes>
  );
}
