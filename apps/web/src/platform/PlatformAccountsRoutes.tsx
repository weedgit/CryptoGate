import { Suspense, lazy, useEffect } from "react";
import { useMatch } from "react-router-dom";
import { platformRoute } from "../shared/portalRouting";
import { OnboardWizardLoading } from "../shared/OnboardWizardLoading";
import { RouteErrorBoundary } from "../shared/RouteErrorBoundary";
import { loadLazyChunk } from "../shared/lazyChunkRecovery";
import type { Session } from "./api";
import { AccountsPage } from "./ArchitecturePage";
import { RequirePlatformOperator } from "./RequirePlatformPortal";

const OnboardAgentPage = lazy(() =>
  loadLazyChunk(() =>
    import("./OnboardAgentPage").then((m) => ({
      default: m.OnboardAgentPage,
    })),
  ),
);

const OnboardMerchantPage = lazy(() =>
  loadLazyChunk(() =>
    import("./OnboardMerchantPage").then((m) => ({
      default: m.OnboardMerchantPage,
    })),
  ),
);

const OnboardSitePage = lazy(() =>
  loadLazyChunk(() =>
    import("./OnboardSitePage").then((m) => ({
      default: m.OnboardSitePage,
    })),
  ),
);

type Props = {
  session: Session;
};

/**
 * Unified Accounts area — org tree + agent/merchant detail.
 * Onboard wizards stay overlaid so the tree does not unmount.
 */
export function PlatformAccountsRoutes({ session }: Props) {
  const agentNew = useMatch({ path: platformRoute("agents/new"), end: true });
  const merchantNew = useMatch({
    path: platformRoute("merchants/new"),
    end: true,
  });
  const siteNew = useMatch({ path: platformRoute("sites/new"), end: true });

  useEffect(() => {
    const t1 = window.setTimeout(() => void import("./OnboardAgentPage"), 600);
    const t2 = window.setTimeout(
      () => void import("./OnboardMerchantPage"),
      700,
    );
    const t3 = window.setTimeout(() => void import("./OnboardSitePage"), 800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, []);

  return (
    <>
      <AccountsPage session={session} />
      {agentNew ? (
        <RouteErrorBoundary>
          <Suspense
            fallback={
              <OnboardWizardLoading
                title="Onboard agent"
                closeTo={platformRoute("accounts")}
              />
            }
          >
            <RequirePlatformOperator session={session}>
              <OnboardAgentPage session={session} />
            </RequirePlatformOperator>
          </Suspense>
        </RouteErrorBoundary>
      ) : null}
      {merchantNew ? (
        <RouteErrorBoundary>
          <Suspense
            fallback={
              <OnboardWizardLoading
                title="Onboard merchant"
                closeTo={platformRoute("accounts")}
              />
            }
          >
            <RequirePlatformOperator session={session}>
              <OnboardMerchantPage session={session} />
            </RequirePlatformOperator>
          </Suspense>
        </RouteErrorBoundary>
      ) : null}
      {siteNew ? (
        <RouteErrorBoundary>
          <Suspense
            fallback={
              <OnboardWizardLoading
                title="New site"
                closeTo={platformRoute("accounts")}
              />
            }
          >
            <RequirePlatformOperator session={session}>
              <OnboardSitePage session={session} />
            </RequirePlatformOperator>
          </Suspense>
        </RouteErrorBoundary>
      ) : null}
    </>
  );
}
