import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getSession, logout, type Session } from "./api";
import { AgentsListPage } from "./AgentsListPage";
import { AgentDetailPage } from "./AgentDetailPage";
import { DashboardPage } from "./DashboardPage";
import { IssueServiceBillPage } from "./IssueServiceBillPage";
import { LoginPage } from "./LoginPage";
import { MerchantsListPage } from "./MerchantsListPage";
import { OnboardAgentPage } from "./OnboardAgentPage";
import { PlatformShell } from "./PlatformShell";
import {
  RequirePlatformOperator,
  RequirePlatformPortal,
} from "./RequirePlatformPortal";
import { AuditLogPage } from "./AuditLogPage";
import { ServiceBillDetailPage } from "./ServiceBillDetailPage";
import { ServiceBillsListPage } from "./ServiceBillsListPage";

type ShellProps = {
  session: Session;
  title: string;
  crumb: string;
  children: ReactNode;
  onSignOut: () => void;
};

function Shell({ session, title, crumb, children, onSignOut }: ShellProps) {
  return (
    <RequirePlatformPortal session={session}>
      <PlatformShell
        session={session}
        title={title}
        crumb={crumb}
        onSignOut={onSignOut}
      >
        {children}
      </PlatformShell>
    </RequirePlatformPortal>
  );
}

export function PlatformApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    getSession()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return (
      <div className="login-wrap">
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <LoginPage
        onSignedIn={() => {
          getSession().then(setSession).catch(() => setSession(null));
        }}
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
            title="Platform Dashboard"
            crumb="Overview"
            onSignOut={signOut}
          >
            <DashboardPage session={session} />
          </Shell>
        }
      />
      <Route
        path="agents"
        element={
          <Shell session={session} title="Agent Accounts" crumb="Agents" onSignOut={signOut}>
            <AgentsListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="agents/new"
        element={
          <Shell
            session={session}
            title="Onboard Agent"
            crumb="Agents"
            onSignOut={signOut}
          >
            <RequirePlatformOperator session={session}>
              <OnboardAgentPage />
            </RequirePlatformOperator>
          </Shell>
        }
      />
      <Route
        path="agents/:id"
        element={
          <Shell
            session={session}
            title="Agent Detail"
            crumb="Agents"
            onSignOut={signOut}
          >
            <AgentDetailPage />
          </Shell>
        }
      />
      <Route
        path="merchants"
        element={
          <Shell
            session={session}
            title="Merchants"
            crumb="Merchants"
            onSignOut={signOut}
          >
            <MerchantsListPage />
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
            crumb="Billing"
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
            title="Service Bill Detail"
            crumb="Billing"
            onSignOut={signOut}
          >
            <ServiceBillDetailPage session={session} />
          </Shell>
        }
      />
      <Route
        path="audit"
        element={
          <Shell
            session={session}
            title="Audit Log"
            crumb="Audit"
            onSignOut={signOut}
          >
            <AuditLogPage />
          </Shell>
        }
      />
      <Route path="*" element={<Navigate to="/platform" replace />} />
    </Routes>
  );
}
