import { useMatch, useNavigate } from "react-router-dom";
import { merchantRoute } from "../shared/portalRouting";
import type { Session } from "./api";
import { CreateSiteModal } from "./CreateSiteModal";
import { SiteDetailPage } from "./SiteDetailPage";
import { SitesListPage } from "./SitesListPage";

type Props = {
  session: Session;
};

/**
 * Sites area — keep the list mounted when opening the create modal so the
 * background does not flash a loading state (`/merchant/sites/new`).
 */
export function MerchantSitesRoutes({ session }: Props) {
  const navigate = useNavigate();
  const createMatch = useMatch({ path: merchantRoute("sites/new"), end: true });
  const detailMatch = useMatch({
    path: `${merchantRoute("sites")}/:siteId`,
    end: true,
  });
  const siteId = detailMatch?.params?.siteId;
  const isDetail = siteId != null && siteId !== "new";

  if (isDetail) {
    return <SiteDetailPage session={session} />;
  }

  return (
    <>
      <SitesListPage session={session} />
      {createMatch ? (
        <CreateSiteModal
          session={session}
          onClose={() => navigate(merchantRoute("sites"))}
        />
      ) : null}
    </>
  );
}
