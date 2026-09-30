import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import "../styles/merchant.css";
import "../styles/components.css";
import { logout, type Session } from "./api";
import { invalidateAllPortalDataCaches } from "../shared/portalDataCaches";
import { PortalShellBoot } from "../auth/PortalShellBoot";
import { usePortalBoot } from "../auth/usePortalBoot";
import { ForceChangePasswordGate } from "../auth/ForceChangePasswordGate";
import { ForceMfaEnrollmentGate } from "../auth/ForceMfaEnrollmentGate";
import { sessionNeedsForcedMfa } from "../auth/mfaSession";
import { LoginPage } from "./LoginPage";
import { MerchantShell } from "./MerchantShell";
import { CashierShell } from "./cashier/CashierShell";
import { RequireOwnerPortal } from "./RequireOwnerPortal";
import { RequireMerchantPortal } from "./RequireMerchantPortal";
import { CashierForbiddenPage } from "./CashierForbiddenPage";
import {
  experienceShowsServiceBills,
  resolveMerchantExperience,
  type MerchantExperience,
} from "./experience";
import { sessionCanCharge } from "./org";
import { useChargeReturnTo } from "./chargeLink";
import {
  WorkspaceSwitcherContext,
  readStoredWorkspace,
  resolveWorkspaceOrgId,
  scopeSessionToWorkspace,
  sessionWorkspaces,
  storeWorkspace,
  unscopeSession,
} from "./workspace";
import { merchantRoute } from "../shared/portalRouting";
import { LazyRoute } from "../shared/LazyRoute";
import { lazyNamed } from "../shared/lazyNamed";

const DashboardPage = lazyNamed(
  () => import("./DashboardPage"),
  "DashboardPage",
);
const CashierHomePage = lazyNamed(
  () => import("./cashier/CashierHomePage"),
  "CashierHomePage",
);
const LivePaymentPage = lazyNamed(
  () => import("./cashier/LivePaymentPage"),
  "LivePaymentPage",
);
const ShiftPage = lazyNamed(() => import("./cashier/ShiftPage"), "ShiftPage");
const PayPadPage = lazyNamed(() => import("./cashier/PayPadPage"), "PayPadPage");
const NetworksPage = lazyNamed(() => import("./NetworksPage"), "NetworksPage");
const MerchantOrdersRoutes = lazyNamed(
  () => import("./MerchantOrdersRoutes"),
  "MerchantOrdersRoutes",
);
const NotificationsSettingsPage = lazyNamed(
  () => import("./NotificationsSettingsPage"),
  "NotificationsSettingsPage",
);
const TeamSettingsPage = lazyNamed(
  () => import("./TeamSettingsPage"),
  "TeamSettingsPage",
);
const SettlementPage = lazyNamed(
  () => import("./SettlementPage"),
  "SettlementPage",
);
const ServiceBillDetailPage = lazyNamed(
  () => import("./ServiceBillDetailPage"),
  "ServiceBillDetailPage",
);
const ServiceBillsListPage = lazyNamed(
  () => import("./ServiceBillsListPage"),
  "ServiceBillsListPage",
);
const MerchantSitesRoutes = lazyNamed(
  () => import("./MerchantSitesRoutes"),
  "MerchantSitesRoutes",
);

function MerchantShellLayout({
  session,
  experience,
  onSignOut,
  onSessionRefresh,
}: {
  session: Session;
  experience: MerchantExperience;
  onSignOut: () => void | Promise<void>;
  onSessionRefresh?: (session: Session) => void;
}) {
  const outlet = (
    <LazyRoute>
      <Outlet />
    </LazyRoute>
  );
  return (
    <RequireMerchantPortal session={session} onSignOut={onSignOut}>
      {experience === "cashier" ? (
        <CashierShell
          session={session}
          onSignOut={onSignOut}
          onSessionRefresh={onSessionRefresh}
        >
          {outlet}
        </CashierShell>
      ) : (
        <MerchantShell
          session={session}
          experience={experience}
          onSignOut={onSignOut}
          onSessionRefresh={onSessionRefresh}
        >
          {outlet}
        </MerchantShell>
      )}
    </RequireMerchantPortal>
  );
}

/** Merchant / site staff charging from the portal — same terminal as cashiers plus "Back to portal". */
function ChargeTerminalLayout({
  session,
  onSignOut,
  onSessionRefresh,
}: {
  session: Session;
  onSignOut: () => void | Promise<void>;
  onSessionRefresh?: (session: Session) => void;
}) {
  const backTo = useChargeReturnTo();
  if (!sessionCanCharge(session)) return <Navigate to={merchantRoute()} replace />;
  return (
    <RequireMerchantPortal session={session} onSignOut={onSignOut}>
      <CashierShell
        session={session}
        onSignOut={onSignOut}
        onSessionRefresh={onSessionRefresh}
        backTo={backTo}
      >
        <LazyRoute>
          <Outlet />
        </LazyRoute>
      </CashierShell>
    </RequireMerchantPortal>
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
  const {
    session: fullSession,
    setSession: setFullSession,
    mfaPending,
    booting,
    completeSignIn,
  } = usePortalBoot();
  const navigate = useNavigate();

  const workspaces = useMemo(
    () => (fullSession ? sessionWorkspaces(fullSession) : []),
    [fullSession],
  );
  const userId = fullSession?.userId ?? null;
  const [preferredOrgId, setPreferredOrgId] = useState<string | null>(() =>
    userId ? readStoredWorkspace(userId) : null,
  );
  useEffect(() => {
    setPreferredOrgId(userId ? readStoredWorkspace(userId) : null);
  }, [userId]);
  const activeOrgId = resolveWorkspaceOrgId(workspaces, preferredOrgId);

  const session = useMemo(
    () => (fullSession ? scopeSessionToWorkspace(fullSession, activeOrgId) : null),
    [fullSession, activeOrgId],
  );
  const setSession = useCallback(
    (next: Session | null) => {
      if (!next || !session || !fullSession) {
        setFullSession(next);
        return;
      }
      setFullSession(unscopeSession(next, session, fullSession));
    },
    [session, fullSession, setFullSession],
  );

  const switcher = useMemo(
    () => ({
      workspaces,
      activeOrgId,
      switchTo: (orgId: string) => {
        if (!userId || orgId === activeOrgId) return;
        storeWorkspace(userId, orgId);
        invalidateAllPortalDataCaches();
        setPreferredOrgId(orgId);
        navigate(merchantRoute(), { replace: true });
      },
    }),
    [workspaces, activeOrgId, userId, navigate],
  );

  const experience = useMemo(
    () => (session ? resolveMerchantExperience(session) : null),
    [session],
  );

  if (!session && booting) {
    return <PortalShellBoot />;
  }

  if (!session || !experience) {
    return (
      <LoginPage startOnMfa={mfaPending} onSignedIn={completeSignIn} />
    );
  }

  if (session.mustChangePassword) {
    return (
      <ForceChangePasswordGate portalLabel="Merchant portal" onChanged={setSession} />
    );
  }

  if (sessionNeedsForcedMfa(session)) {
    return (
      <ForceMfaEnrollmentGate
        session={session}
        portalLabel="Merchant portal"
        onEnrolled={setSession}
      />
    );
  }

  const signOut = async () => {
    await logout();
    invalidateAllPortalDataCaches();
    setSession(null);
  };

  const shell = (
    <MerchantShellLayout
      session={session}
      experience={experience}
      onSignOut={signOut}
      onSessionRefresh={setSession}
    />
  );

  return (
    <WorkspaceSwitcherContext.Provider value={switcher}>
      <Routes key={activeOrgId ?? ""}>
        {experience !== "cashier" ? (
          <Route
            element={
              <ChargeTerminalLayout
                session={session}
                onSignOut={signOut}
                onSessionRefresh={setSession}
              />
            }
          >
            <Route path="charge" element={<PayPadPage session={session} />} />
            <Route path="pay/:orderId" element={<LivePaymentPage session={session} />} />
          </Route>
        ) : null}
        <Route element={shell}>
          {experience === "cashier"
            ? cashierRoutes(session)
            : backOfficeRoutes(session, experience, setSession)}
        </Route>
      </Routes>
    </WorkspaceSwitcherContext.Provider>
  );
}

/** Cashier terminal: charge, follow, and review own orders; everything else is forbidden. */
function cashierRoutes(session: Session) {
  return (
    <>
      <Route index element={<CashierHomePage session={session} />} />
      <Route path="charge" element={<Navigate to={merchantRoute()} replace />} />
      <Route path="pay/:orderId" element={<LivePaymentPage session={session} />} />
      <Route path="shift" element={<ShiftPage session={session} />} />
      <Route path="orders/*" element={<MerchantOrdersRoutes session={session} />} />
      <Route
        path="settings/notifications"
        element={<NotificationsSettingsPage session={session} />}
      />
      <Route path="*" element={<CashierForbiddenPage area="this page" />} />
    </>
  );
}

/** Merchant and site back office; sites have no service bills. */
function backOfficeRoutes(
  session: Session,
  experience: Exclude<MerchantExperience, "cashier">,
  setSession: (session: Session) => void,
) {
  const showBills = experienceShowsServiceBills(experience);
  return (
    <>
      <Route
        index
        element={<DashboardPage session={session} isSite={experience === "site"} />}
      />
      <Route
        path="orders/*"
        element={<MerchantOrdersRoutes session={session} />}
      />
      <Route
        path="settings/integrations"
        element={<Navigate to={merchantRoute("networks")} replace />}
      />
      <Route
        path="settings/settlement"
        element={
          <OwnerOnly session={session} area="settlement settings">
            <SettlementPage
              session={session}
              onSessionRefresh={setSession}
            />
          </OwnerOnly>
        }
      />
      <Route
        path="settings/organization"
        element={<Navigate to={merchantRoute("settings/team")} replace />}
      />
      <Route
        path="settings/billing"
        element={
          showBills ? (
            <Navigate to={merchantRoute("service-bills")} replace />
          ) : (
            <Navigate to={merchantRoute()} replace />
          )
        }
      />
      <Route
        path="settings/security"
        element={<Navigate to={merchantRoute()} replace />}
      />
      <Route
        path="settings/notifications"
        element={<NotificationsSettingsPage session={session} />}
      />
      <Route
        path="settings/pricing"
        element={<Navigate to={merchantRoute("settings/settlement")} replace />}
      />
      <Route
        path="settings/team"
        element={
          <OwnerOnly session={session} area="team settings">
            <TeamSettingsPage
              session={session}
              onSessionRefresh={setSession}
            />
          </OwnerOnly>
        }
      />
      <Route
        path="networks"
        element={
          <OwnerOnly session={session} area="network catalog">
            <NetworksPage session={session} />
          </OwnerOnly>
        }
      />
      <Route
        path="settings/*"
        element={
          <OwnerOnly session={session} area="settings">
            <Navigate to={merchantRoute("settings/team")} replace />
          </OwnerOnly>
        }
      />
      {showBills ? (
        <>
          <Route
            path="service-bills"
            element={
              <OwnerOnly session={session} area="service bills">
                <ServiceBillsListPage session={session} />
              </OwnerOnly>
            }
          />
          <Route
            path="service-bills/:id"
            element={
              <OwnerOnly session={session} area="service bills">
                <ServiceBillDetailPage session={session} />
              </OwnerOnly>
            }
          />
        </>
      ) : null}
      <Route
        path="sites"
        element={<MerchantSitesRoutes session={session} />}
      />
      <Route
        path="sites/new"
        element={<MerchantSitesRoutes session={session} />}
      />
      <Route
        path="sites/:id"
        element={<MerchantSitesRoutes session={session} />}
      />
      <Route path="reports/*" element={<Navigate to={merchantRoute()} replace />} />
      <Route path="*" element={<Navigate to={merchantRoute()} replace />} />
    </>
  );
}
