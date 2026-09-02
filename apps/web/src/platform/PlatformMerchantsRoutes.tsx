import { Suspense, lazy, useEffect } from "react";
import { useMatch } from "react-router-dom";
import { platformRoute } from "../shared/portalRouting";
import { OnboardWizardLoading } from "../shared/OnboardWizardLoading";
import type { Session } from "./api";
import { MerchantsListPage } from "./MerchantsListPage";
import { RequirePlatformOperator } from "./RequirePlatformPortal";

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
 * background does not flash a full-page loading state (`/platform/merchants/new`).
 */
export function PlatformMerchantsRoutes({ session }: Props) {
  const createMatch = useMatch({
    path: platformRoute("merchants/new"),
    end: true,
  });

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
              closeTo={platformRoute("merchants")}
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
