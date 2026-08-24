import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { getSession, logout, type PaymentDetails, type Session } from "./api";
import { CreateOrderPage } from "./CreateOrderPage";
import { LoginPage } from "./LoginPage";
import { MerchantShell } from "./MerchantShell";

function Placeholder({ title }: { title: string }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      <p style={{ color: "var(--muted)" }}>
        Shell placeholder — wired in a later merchant task.
      </p>
      <p>
        <Link to="/merchant/orders/new" style={{ color: "var(--teal)" }}>
          Create payment order →
        </Link>
      </p>
    </div>
  );
}

function OrderDetail() {
  const { id } = useParams();
  const location = useLocation();
  const pay = (location.state as { pay?: PaymentDetails } | null)?.pay;
  return (
    <div className="panel">
      <h2>Order {pay?.orderNumber ?? id}</h2>
      {pay ? (
        <>
          <p style={{ color: "var(--muted)" }}>
            Status: {pay.status} · {pay.payableAmount.amount} {pay.asset} on{" "}
            {pay.network.toUpperCase()}
          </p>
          <div className="addr-box">{pay.receiveAddress}</div>
          <p style={{ marginTop: 16 }}>
            <a href={pay.paymentPageUrl} style={{ color: "var(--teal)" }} target="_blank" rel="noreferrer">
              Open guest payment page
            </a>
          </p>
        </>
      ) : (
        <p style={{ color: "var(--muted)" }}>
          Order created. Reload detail from list in a later slice.
        </p>
      )}
      <p style={{ marginTop: 16 }}>
        <Link to="/merchant/orders/new" style={{ color: "var(--teal)" }}>
          Create another
        </Link>
      </p>
    </div>
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

  return (
    <Routes>
      <Route
        path="/merchant/orders/new"
        element={
          <MerchantShell
            session={session}
            title="New Payment Request"
            crumb="Generate Invoice Flow"
            onSignOut={async () => {
              await logout();
              setSession(null);
            }}
          >
            <CreateOrderPage />
          </MerchantShell>
        }
      />
      <Route
        path="/merchant/orders/:id"
        element={
          <MerchantShell
            session={session}
            title="Order detail"
            crumb="Orders"
            onSignOut={async () => {
              await logout();
              setSession(null);
            }}
          >
            <OrderDetail />
          </MerchantShell>
        }
      />
      <Route
        path="/merchant"
        element={
          <MerchantShell
            session={session}
            title="Dashboard"
            crumb="Overview"
            onSignOut={async () => {
              await logout();
              setSession(null);
            }}
          >
            <Placeholder title="Dashboard" />
          </MerchantShell>
        }
      />
      <Route
        path="/merchant/*"
        element={
          <MerchantShell
            session={session}
            title="Merchant"
            crumb="Portal"
            onSignOut={async () => {
              await logout();
              setSession(null);
            }}
          >
            <Placeholder title="Coming next" />
          </MerchantShell>
        }
      />
      <Route path="*" element={<Navigate to="/merchant/orders/new" replace />} />
    </Routes>
  );
}
