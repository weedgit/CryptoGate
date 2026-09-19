import { Suspense, lazy, useEffect } from "react";
import { useMatch } from "react-router-dom";
import { platformRoute } from "../shared/portalRouting";
import { OnboardWizardLoading } from "../shared/OnboardWizardLoading";
import type { Session } from "./api";
import { AccountsPage } from "./ArchitecturePage";
import { RequirePlatformOperator } from "./RequirePlatformPortal";

const OnboardAgentPage = lazy(() =>
  import("./OnboardAgentPage").then((m) => ({
    default: m.OnboardAgentPage,
  })),
);

const OnboardMerchantPage = lazy(() =>
  import("./OnboardMerchantPage").then((m) => ({
    default: m.OnboardMerchantPage,
  })),
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

  useEffect(() => {
    const t1 = window.setTimeout(() => void import("./OnboardAgentPage"), 600);
    const t2 = window.setTimeout(
      () => void import("./OnboardMerchantPage"),
      700,
    );
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return (
    <>
      <AccountsPage session={session} />
      {agentNew ? (
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
      ) : null}
      {merchantNew ? (
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
      ) : null}
    </>
  );
}
