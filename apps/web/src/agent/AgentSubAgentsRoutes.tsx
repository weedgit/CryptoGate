import { Suspense, lazy, useEffect } from "react";
import { useMatch } from "react-router-dom";
import { agentRoute } from "../shared/portalRouting";
import { OnboardWizardLoading } from "../shared/OnboardWizardLoading";
import type { Session } from "./api";
import { SubAgentsListPage } from "./SubAgentsListPage";
import { RequireAgentOperator } from "./RequireAgentPortal";

const OnboardSubAgentPage = lazy(() =>
  import("./OnboardSubAgentPage").then((m) => ({
    default: m.OnboardSubAgentPage,
  })),
);

type Props = {
  session: Session;
};

/**
 * Sub-agents area — keep the list mounted when opening the onboard wizard so the
 * background does not flash a full-page loading state (`/agent/agents/new`).
 */
export function AgentSubAgentsRoutes({ session }: Props) {
  const createMatch = useMatch({ path: agentRoute("agents/new"), end: true });

  useEffect(() => {
    const timer = window.setTimeout(() => void import("./OnboardSubAgentPage"), 600);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <SubAgentsListPage session={session} />
      {createMatch ? (
        <Suspense
          fallback={
            <OnboardWizardLoading
              title="Onboard sub-agent"
              closeTo={agentRoute("agents")}
            />
          }
        >
          <RequireAgentOperator session={session}>
            <OnboardSubAgentPage session={session} />
          </RequireAgentOperator>
        </Suspense>
      ) : null}
    </>
  );
}
