import { Suspense, type ReactNode } from "react";
import { PagePending } from "../platform/ui/PlatformPending";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

/** Keep shell chrome mounted while a lazy route chunk loads. */
export function LazyRoute({
  children,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<PagePending />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}
