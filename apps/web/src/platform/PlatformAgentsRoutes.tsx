import { Suspense, lazy, useEffect } from "react";
import { useMatch } from "react-router-dom";
import { platformRoute } from "../shared/portalRouting";
import { OnboardWizardLoading } from "../shared/OnboardWizardLoading";
import type { Session } from "./api";
import { AgentsListPage } from "./AgentsListPage";
import { RequirePlatformOperator } from "./RequirePlatformPortal";

const OnboardAgentPage = lazy(() =>
  import("./OnboardAgentPage").then((m) => ({
    default: m.OnboardAgentPage,
  })),
);

type Props = {
  session: Session;
};

/**
 * Agents area — keep the list mounted when opening the onboard wizard so the
 * background does not flash a full-page loading state (`/platform/agents/new`).
 */
export function PlatformAgentsRoutes({ session }: Props) {
  const createMatch = useMatch({ path: platformRoute("agents/new"), end: true });

  useEffect(() => {
    const timer = window.setTimeout(() => void import("./OnboardAgentPage"), 600);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <AgentsListPage session={session} />
      {createMatch ? (
        <Suspense
          fallback={
            <OnboardWizardLoading
              title="Onboard agent"
              closeTo={platformRoute("agents")}
            />
          }
        >
          <RequirePlatformOperator session={session}>
            <OnboardAgentPage session={session} />
          </RequirePlatformOperator>
        </Suspense>
      ) : null}
    </>
  );
}
