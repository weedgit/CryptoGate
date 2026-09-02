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

type Props = {
  session: Session;
};

/**
 * Merchants area — keep the list mounted when opening the onboard wizard so the
 * background does not flash a full-page loading state (`/agent/merchants/new`).
 */
export function AgentMerchantsRoutes({ session }: Props) {
  const createMatch = useMatch({ path: agentRoute("merchants/new"), end: true });

  useEffect(() => {
    const timer = window.setTimeout(() => void import("./OnboardMerchantPage"), 600);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <MerchantsListPage session={session} />
      {createMatch ? (
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
    </>
  );
}
