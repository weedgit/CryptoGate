import { Suspense, type ReactNode } from "react";
import { PlatformPending } from "../platform/ui/PlatformPending";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

/** Keep shell chrome mounted while a lazy route chunk loads. */
export function LazyRoute({
  children,
  title = "Loading page",
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <RouteErrorBoundary>
      <Suspense
        fallback={
          <div className="lazy-route-pending">
            <PlatformPending
              title={title}
              copy="Opening this view."
            />
          </div>
        }
      >
        {children}
      </Suspense>
    </RouteErrorBoundary>
  );
}
