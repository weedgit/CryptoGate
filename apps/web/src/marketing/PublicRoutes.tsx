import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const MarketingLandingPage = lazy(() =>
  import("./MarketingLandingPage").then((m) => ({
    default: m.MarketingLandingPage,
  })),
);

const SignInHubPage = lazy(() =>
  import("./SignInHubPage").then((m) => ({ default: m.SignInHubPage })),
);

function PublicFallback() {
  return (
    <div className="login-wrap">
      <p className="login-boot">Loading…</p>
    </div>
  );
}

export function PublicRoutes() {
  return (
    <Suspense fallback={<PublicFallback />}>
      <Routes>
        <Route index element={<MarketingLandingPage />} />
        <Route path="login" element={<SignInHubPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
