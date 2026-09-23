import { Suspense, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { PagePending } from "../platform/ui/PlatformPending";
import { RouteLoadErrorView, RoutedErrorBoundary } from "./RouteErrorBoundary";

/** Keep shell chrome mounted while a lazy route chunk loads. */
export function LazyRoute({
  children,
}: {
  children: ReactNode;
  title?: string;
}) {
  const { search } = useLocation();
  const previewRefresh = new URLSearchParams(search).get("preview") === "refresh";

  return (
    <RoutedErrorBoundary>
      <Suspense fallback={<PagePending />}>
        {previewRefresh ? <RouteLoadErrorView /> : children}
      </Suspense>
    </RoutedErrorBoundary>
  );
}
