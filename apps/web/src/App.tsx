import { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PortalShellBoot } from "./auth/PortalShellBoot";
import "./styles/loading.css";
import { lazyNamed } from "./shared/lazyNamed";
import { RouteErrorBoundary } from "./shared/RouteErrorBoundary";
import { merchantRoute, portalFromHostname } from "./shared/portalRouting";

const PlatformApp = lazyNamed(
  () => import("./platform/PlatformApp"),
  "PlatformApp",
);
const AgentApp = lazyNamed(() => import("./agent/AgentApp"), "AgentApp");
const MerchantApp = lazyNamed(
  () => import("./merchant/MerchantApp"),
  "MerchantApp",
);

function PortalFallback() {
  return <PortalShellBoot />;
}

function LegacyPortalRoutes() {
  return (
    <Routes>
      <Route path="/platform/*" element={<PlatformApp />} />
      <Route path="/agent/*" element={<AgentApp />} />
      <Route path="/merchant/*" element={<MerchantApp />} />
      <Route path="/login" element={<Navigate to={merchantRoute()} replace />} />
      <Route path="/" element={<Navigate to={merchantRoute()} replace />} />
      <Route path="*" element={<Navigate to={merchantRoute()} replace />} />
    </Routes>
  );
}

export function App() {
  const dedicatedPortal = portalFromHostname();

  return (
    <RouteErrorBoundary>
      <Suspense fallback={<PortalFallback />}>
        {dedicatedPortal === "platform" ? (
          <PlatformApp />
        ) : dedicatedPortal === "agent" ? (
          <AgentApp />
        ) : dedicatedPortal === "merchant" ? (
          <MerchantApp />
        ) : (
          <LegacyPortalRoutes />
        )}
      </Suspense>
    </RouteErrorBoundary>
  );
}
