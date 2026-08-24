import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getSession, logout, type Session } from "./api";
import { CashierForbiddenPage } from "./CashierForbiddenPage";
import { CreateOrderPage } from "./CreateOrderPage";
import { DashboardPage } from "./DashboardPage";
import { LoginPage } from "./LoginPage";
import { MerchantShell } from "./MerchantShell";
import { OrderDetailPage } from "./OrderDetailPage";
import { OrdersListPage } from "./OrdersListPage";
import { RequireOwnerPortal } from "./RequireOwnerPortal";
import { SettlementPage } from "./SettlementPage";
import { sessionIsCashierOnly } from "./org";

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
  showCashierBanner?: boolean;
};

function Shell({
  session,
  title,
  crumb,
  children,
  onSignOut,
  showCashierBanner = false,
}: ShellProps) {
  return (
    <MerchantShell
      session={session}
      title={title}
      crumb={crumb}
      onSignOut={onSignOut}
      showCashierBanner={showCashierBanner}
    >
      {children}
    </MerchantShell>
  );
}

function OwnerOnly({
  session,
  area,
  children,
}: {
  session: Session;
  area: string;
  children: ReactNode;
}) {
  return (
    <RequireOwnerPortal session={session} area={area}>
      {children}
    </RequireOwnerPortal>
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

  const cashier = useMemo(
    () => (session ? sessionIsCashierOnly(session) : false),
    [session],
  );

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

  const dashTitle = cashier ? "Cashier Dashboard" : "Merchant Dashboard";
  const ordersTitle = cashier ? "My Orders" : "Orders Directory";
  const createTitle = cashier ? "Payment Request Terminal" : "New Payment Request";

  return (
    <Routes>
      <Route
        path="/merchant"
        element={
          <Shell session={session} title={dashTitle} crumb="Overview" onSignOut={signOut}>
            <DashboardPage session={session} />
          </Shell>
        }
      />
      <Route
        path="/merchant/orders"
        element={
          <Shell session={session} title={ordersTitle} crumb="Payment Orders" onSignOut={signOut}>
            <OrdersListPage session={session} />
          </Shell>
        }
      />
      <Route
        path="/merchant/orders/new"
        element={
          <Shell
            session={session}
            title={createTitle}
            crumb="Generate Invoice Flow"
            onSignOut={signOut}
            showCashierBanner={cashier}
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
            <OwnerOnly session={session} area="settlement settings">
              <SettlementPage session={session} />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="/merchant/settings/*"
        element={
          <Shell session={session} title="Settings" crumb="Configuration" onSignOut={signOut}>
            <OwnerOnly session={session} area="settings">
              <Placeholder title="Settings" />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="/merchant/service-bills/*"
        element={
          <Shell session={session} title="Service Bills" crumb="Restricted" onSignOut={signOut}>
            <OwnerOnly session={session} area="service bills">
              <Placeholder title="Service bills" />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="/merchant/sites/*"
        element={
          <Shell session={session} title="Sites" crumb="Restricted" onSignOut={signOut}>
            <OwnerOnly session={session} area="sites">
              <Placeholder title="Sites" />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="/merchant/reports/*"
        element={
          <Shell session={session} title="Reports" crumb="Restricted" onSignOut={signOut}>
            <OwnerOnly session={session} area="reports">
              <Placeholder title="Reports" />
            </OwnerOnly>
          </Shell>
        }
      />
      <Route
        path="/merchant/*"
        element={
          <Shell session={session} title="Merchant" crumb="Portal" onSignOut={signOut}>
            {cashier ? (
              <CashierForbiddenPage area="this page" />
            ) : (
              <Placeholder title="Coming next" />
            )}
          </Shell>
        }
      />
      <Route path="*" element={<Navigate to="/merchant" replace />} />
    </Routes>
  );
}
