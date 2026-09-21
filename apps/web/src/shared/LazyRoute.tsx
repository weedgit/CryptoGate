import { Suspense, type ReactNode } from "react";
import { PagePending } from "../platform/ui/PlatformPending";
import { RoutedErrorBoundary } from "./RouteErrorBoundary";

/** Keep shell chrome mounted while a lazy route chunk loads. */
export function LazyRoute({
  children,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <RoutedErrorBoundary>
      <Suspense fallback={<PagePending />}>{children}</Suspense>
    </RoutedErrorBoundary>
  );
}
