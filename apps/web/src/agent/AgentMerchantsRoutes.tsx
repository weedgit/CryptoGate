import { Suspense, lazy, useEffect } from "react";
import { useMatch } from "react-router-dom";
import { agentRoute } from "../shared/portalRouting";
import { OnboardWizardLoading } from "../shared/OnboardWizardLoading";
import type { Session } from "./api";
import { MerchantsListPage } from "./MerchantsListPage";
import { RequireAgentOperator } from "./RequireAgentPortal";

const OnboardMerchantPage = lazy(() =>
  import("./OnboardMerchantPage").then((m) => ({
    default: m.OnboardMerchantPage,
  })),
);

const OnboardSitePage = lazy(() =>
  import("./OnboardSitePage").then((m) => ({
    default: m.OnboardSitePage,
  })),
);

type Props = {
  session: Session;
};

/**
 * Merchants area — keep the list mounted when opening onboard wizards so the
 * background does not flash a full-page loading state.
 */
export function AgentMerchantsRoutes({ session }: Props) {
  const createMerchantMatch = useMatch({
    path: agentRoute("merchants/new"),
    end: true,
  });
  const createSiteMatch = useMatch({
    path: agentRoute("sites/new"),
    end: true,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void import("./OnboardMerchantPage");
      void import("./OnboardSitePage");
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <MerchantsListPage session={session} />
      {createMerchantMatch ? (
        <Suspense
          fallback={
            <OnboardWizardLoading
              title="Onboard merchant"
              closeTo={agentRoute("merchants")}
            />
          }
        >
          <RequireAgentOperator session={session}>
            <OnboardMerchantPage session={session} />
          </RequireAgentOperator>
        </Suspense>
      ) : null}
      {createSiteMatch ? (
        <Suspense
          fallback={
            <OnboardWizardLoading
              title="New site"
              closeTo={agentRoute("merchants")}
            />
          }
        >
          <RequireAgentOperator session={session}>
            <OnboardSitePage session={session} />
          </RequireAgentOperator>
        </Suspense>
      ) : null}
    </>
  );
}
