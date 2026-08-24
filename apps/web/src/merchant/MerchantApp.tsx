import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getSession, logout, type Session } from "./api";
import { CreateOrderPage } from "./CreateOrderPage";
import { DashboardPage } from "./DashboardPage";
import { LoginPage } from "./LoginPage";
import { MerchantShell } from "./MerchantShell";
import { OrderDetailPage } from "./OrderDetailPage";
import { OrdersListPage } from "./OrdersListPage";
import { SettlementPage } from "./SettlementPage";

function Placeholder({ title }: { title: string }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      <p style={{ color: "var(--muted)" }}>
        Shell placeholder — wired in a later merchant task.
      </p>
    </div>
  );
}

type ShellProps = {
  session: Session;
  title: string;
  crumb: string;
  children: ReactNode;
  onSignOut: () => void;
};

function Shell({ session, title, crumb, children, onSignOut }: ShellProps) {
  return (
    <MerchantShell session={session} title={title} crumb={crumb} onSignOut={onSignOut}>
      {children}
    </MerchantShell>
  );
}

export function MerchantApp() {
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
        path="/merchant"
        element={
          <Shell session={session} title="Merchant Dashboard" crumb="Overview" onSignOut={signOut}>
            <DashboardPage session={session} />
          </Shell>
        }
      />
      <Route
        path="/merchant/orders"
        element={
          <Shell session={session} title="Orders Directory" crumb="Payment Orders" onSignOut={signOut}>
            <OrdersListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="/merchant/orders/new"
        element={
          <Shell
            session={session}
            title="New Payment Request"
            crumb="Generate Invoice Flow"
            onSignOut={signOut}
          >
            <CreateOrderPage />
          </Shell>
        }
      />
      <Route
        path="/merchant/orders/:id"
        element={
          <Shell session={session} title="Order Insights" crumb="Orders" onSignOut={signOut}>
            <OrderDetailPage />
          </Shell>
        }
      />
      <Route
        path="/merchant/settings/settlement"
        element={
          <Shell
            session={session}
            title="Settlement Protocol & Address Book"
            crumb="HD Pool & Routing Config"
            onSignOut={signOut}
          >
            <SettlementPage session={session} />
          </Shell>
        }
      />
      <Route
        path="/merchant/*"
        element={
          <Shell session={session} title="Merchant" crumb="Portal" onSignOut={signOut}>
            <Placeholder title="Coming next" />
          </Shell>
        }
      />
      <Route path="*" element={<Navigate to="/merchant" replace />} />
    </Routes>
  );
}
