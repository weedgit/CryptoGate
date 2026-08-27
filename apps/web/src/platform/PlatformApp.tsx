import { type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { logout, type Session } from "./api";
import { usePortalBoot } from "../auth/usePortalBoot";
import { ForceChangePasswordGate } from "../auth/ForceChangePasswordGate";
import { ForceMfaEnrollmentGate } from "../auth/ForceMfaEnrollmentGate";
import { sessionNeedsForcedMfa } from "../auth/mfaSession";
import { SecuritySettingsPage } from "../auth/SecuritySettingsPage";
import { AgentsListPage } from "./AgentsListPage";
import { ArchitecturePage } from "./ArchitecturePage";
import { DashboardPage } from "./DashboardPage";
import { IssueServiceBillPage } from "./IssueServiceBillPage";
import { LoginPage } from "./LoginPage";
import { MerchantsListPage } from "./MerchantsListPage";
import { OnboardMerchantPage } from "./OnboardMerchantPage";
import { OnboardAgentPage } from "./OnboardAgentPage";
import { PlatformShell } from "./PlatformShell";
import {
  RequirePlatformOperator,
  RequirePlatformPortal,
} from "./RequirePlatformPortal";
import { AuditLogPage } from "./AuditLogPage";
import { CompliancePage } from "./CompliancePage";
import { FeeTiersSettingsPage } from "./FeeTiersSettingsPage";
import { PlatformPending } from "./ui/PlatformPending";
import { NetworkCatalogPage } from "./NetworkCatalogPage";
import { PlatformSettingsPage } from "./PlatformSettingsPage";
import { PlatformTeamPage } from "./PlatformTeamPage";
import { ServiceBillDetailPage } from "./ServiceBillDetailPage";
import { ServiceBillsListPage } from "./ServiceBillsListPage";
import { SystemHealthPage } from "./SystemHealthPage";

type ShellProps = {
  session: Session;
  title?: string;
  children: ReactNode;
  onSignOut: () => void;
};

function Shell({ session, title, children, onSignOut }: ShellProps) {
  return (
    <RequirePlatformPortal session={session}>
      <PlatformShell
        session={session}
        title={title}
        onSignOut={onSignOut}
      >
        {children}
      </PlatformShell>
    </RequirePlatformPortal>
  );
}

export function PlatformApp() {
  const { session, setSession, mfaPending, booting, completeSignIn } =
    usePortalBoot();

  if (booting) {
    return (
      <div className="login-wrap">
        <PlatformPending
          title="Starting platform"
          copy="Checking your session."
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
        portalLabel="Platform portal"
        onChanged={setSession}
      />
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

  return (
    <Routes>
      <Route
        index
        element={
          <Shell session={session} onSignOut={signOut}>
            <DashboardPage session={session} />
          </Shell>
        }
      />
      <Route
        path="agents/new"
        element={
          <Shell session={session} onSignOut={signOut}>
            <RequirePlatformOperator session={session}>
              <OnboardAgentPage />
            </RequirePlatformOperator>
          </Shell>
        }
      />
      <Route
        path="agents/:id"
        element={
          <Shell session={session} onSignOut={signOut}>
            <AgentsListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="agents"
        element={
          <Shell session={session} onSignOut={signOut}>
            <AgentsListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="merchants/new"
        element={
          <Shell
            session={session}
            title="Onboard Merchant"
            onSignOut={signOut}
          >
            <RequirePlatformOperator session={session}>
              <OnboardMerchantPage session={session} />
            </RequirePlatformOperator>
          </Shell>
        }
      />
      <Route
        path="merchants/:id"
        element={
          <Shell session={session} onSignOut={signOut}>
            <MerchantsListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="merchants"
        element={
          <Shell session={session} onSignOut={signOut}>
            <MerchantsListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="architecture"
        element={
          <Shell session={session} onSignOut={signOut}>
            <ArchitecturePage session={session} />
          </Shell>
        }
      />
      <Route
        path="service-bills"
        element={
          <Shell session={session} onSignOut={signOut}>
            <ServiceBillsListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="service-bills/new"
        element={
          <Shell
            session={session}
            title="Issue Service Bill"
            onSignOut={signOut}
          >
            <RequirePlatformOperator session={session}>
              <IssueServiceBillPage />
            </RequirePlatformOperator>
          </Shell>
        }
      />
      <Route
        path="service-bills/:id"
        element={
          <Shell
            session={session}
            title="Service Bill Details"
            onSignOut={signOut}
          >
            <ServiceBillDetailPage session={session} />
          </Shell>
        }
      />
      <Route
        path="audit"
        element={
          <Shell session={session} onSignOut={signOut}>
            <AuditLogPage />
          </Shell>
        }
      />
      <Route
        path="compliance"
        element={
          <Shell
            session={session}
            title="Payment anomalies"
            onSignOut={signOut}
          >
            <CompliancePage />
          </Shell>
        }
      />
      <Route
        path="settings"
        element={
          <Shell
            session={session}
            title="Global Settings"
            onSignOut={signOut}
          >
            <PlatformSettingsPage session={session} />
          </Shell>
        }
      />
      <Route
        path="settings/security"
        element={
          <Shell session={session} title="Security" onSignOut={signOut}>
            <SecuritySettingsPage
              session={session}
              variant="platform"
              onSessionRefresh={setSession}
            />
          </Shell>
        }
      />
      <Route
        path="settings/fee-tiers"
        element={
          <Shell
            session={session}
            title="Fee Tiers & Pricing"
            onSignOut={signOut}
          >
            <FeeTiersSettingsPage session={session} />
          </Shell>
        }
      />
      <Route
        path="settings/networks"
        element={
          <Shell
            session={session}
            title="Network Catalog"
            onSignOut={signOut}
          >
            <NetworkCatalogPage />
          </Shell>
        }
      />
      <Route
        path="settings/team"
        element={
          <Shell
            session={session}
            title="Platform Team"
            onSignOut={signOut}
          >
            <PlatformTeamPage session={session} />
          </Shell>
        }
      />
      <Route
        path="ops/health"
        element={
          <Shell
            session={session}
            title="System Health"
            onSignOut={signOut}
          >
            <SystemHealthPage />
          </Shell>
        }
      />
      <Route path="*" element={<Navigate to="/platform" replace />} />
    </Routes>
  );
}
