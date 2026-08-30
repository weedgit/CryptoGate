import { type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { logout, type Session } from "./api";
import { usePortalBoot } from "../auth/usePortalBoot";
import { ForceChangePasswordGate } from "../auth/ForceChangePasswordGate";
import { ForceMfaEnrollmentGate } from "../auth/ForceMfaEnrollmentGate";
import { sessionNeedsForcedMfa } from "../auth/mfaSession";
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
import { BillingWalletSettingsPage } from "./BillingWalletSettingsPage";
import { PlatformPending } from "./ui/PlatformPending";
import { NetworkCatalogPage } from "./NetworkCatalogPage";
import { PlatformTeamPage } from "./PlatformTeamPage";
import { ServiceBillDetailPage } from "./ServiceBillDetailPage";
import { ServiceBillsListPage } from "./ServiceBillsListPage";
import { SystemHealthPage } from "./SystemHealthPage";
import { PlatformCommissionsPage } from "./PlatformCommissionsPage";
import { OrderDetailPage } from "../merchant/OrderDetailPage";

type ShellProps = {
  session: Session;
  children: ReactNode;
  onSignOut: () => void;
  onSessionRefresh?: (session: Session) => void;
};

function Shell({ session, children, onSignOut, onSessionRefresh }: ShellProps) {
  return (
    <RequirePlatformPortal session={session}>
      <PlatformShell
        session={session}
        onSignOut={onSignOut}
        onSessionRefresh={onSessionRefresh}
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
          <Shell session={session} onSignOut={signOut}
          onSessionRefresh={setSession}>
            <DashboardPage session={session} />
          </Shell>
        }
      />
      <Route
        path="agents/new"
        element={
          <Shell session={session} onSignOut={signOut}
          onSessionRefresh={setSession}>
            <RequirePlatformOperator session={session}>
              <OnboardAgentPage />
            </RequirePlatformOperator>
          </Shell>
        }
      />
      <Route
        path="agents/:id"
        element={
          <Shell session={session} onSignOut={signOut}
          onSessionRefresh={setSession}>
            <AgentsListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="agents"
        element={
          <Shell session={session} onSignOut={signOut}
          onSessionRefresh={setSession}>
            <AgentsListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="merchants/new"
        element={
          <Shell session={session} onSignOut={signOut}
          onSessionRefresh={setSession}>
            <RequirePlatformOperator session={session}>
              <OnboardMerchantPage session={session} />
            </RequirePlatformOperator>
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
        path="merchants"
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
        path="service-bills"
        element={
          <Shell session={session} onSignOut={signOut}
          onSessionRefresh={setSession}>
            <ServiceBillsListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="service-bills/new"
        element={<IssueServiceBillPage />}
      />
      <Route
        path="service-bills/:id"
        element={
          <Shell session={session} onSignOut={signOut}
          onSessionRefresh={setSession}>
            <ServiceBillDetailPage session={session} />
          </Shell>
        }
      />
      <Route
        path="commissions"
        element={
          <Shell session={session} onSignOut={signOut}
          onSessionRefresh={setSession}>
            <PlatformCommissionsPage session={session} />
          </Shell>
        }
      />
      <Route
        path="audit"
        element={
          <Shell session={session} onSignOut={signOut}
          onSessionRefresh={setSession}>
            <AuditLogPage />
          </Shell>
        }
      />
      <Route
        path="orders/:id"
        element={
          <Shell session={session} onSignOut={signOut}
          onSessionRefresh={setSession}>
            <OrderDetailPage session={session} variant="platform" />
          </Shell>
        }
      />
      <Route
        path="compliance"
        element={
          <Shell session={session} onSignOut={signOut}
          onSessionRefresh={setSession}>
            <CompliancePage />
          </Shell>
        }
      />
      <Route
        path="settings"
        element={<Navigate to="/platform" replace />}
      />
      <Route
        path="settings/security"
        element={<Navigate to="/platform" replace />}
      />
      <Route
        path="settings/fee-tiers"
        element={
          <Shell session={session} onSignOut={signOut}
          onSessionRefresh={setSession}>
            <FeeTiersSettingsPage session={session} />
          </Shell>
        }
      />
      <Route
        path="settings/billing-wallet"
        element={
          <Shell session={session} onSignOut={signOut}
          onSessionRefresh={setSession}>
            <BillingWalletSettingsPage session={session} />
          </Shell>
        }
      />
      <Route
        path="settings/networks"
        element={
          <Shell session={session} onSignOut={signOut}
          onSessionRefresh={setSession}>
            <NetworkCatalogPage />
          </Shell>
        }
      />
      <Route
        path="settings/team"
        element={
          <Shell session={session} onSignOut={signOut}
          onSessionRefresh={setSession}>
            <PlatformTeamPage session={session} />
          </Shell>
        }
      />
      <Route
        path="ops/health"
        element={
          <Shell session={session} onSignOut={signOut}
          onSessionRefresh={setSession}>
            <SystemHealthPage />
          </Shell>
        }
      />
      <Route path="*" element={<Navigate to="/platform" replace />} />
    </Routes>
  );
}
