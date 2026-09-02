import { useMatch } from "react-router-dom";
import { merchantRoute } from "../shared/portalRouting";
import type { Session } from "./api";
import { peekMerchantOrgs } from "./merchantOrgList";
import { SiteDetailCard } from "./SiteDetailCard";

/** Standalone site detail route (legacy); merchant sites use split list + SiteDetailCard. */
export function SiteDetailPage({ session }: { session: Session }) {
  const detailMatch = useMatch({
    path: `${merchantRoute("sites")}/:siteId`,
    end: true,
  });
  const siteId = detailMatch?.params?.siteId ?? "";
  const site =
    siteId && siteId !== "new"
      ? (peekMerchantOrgs()?.find((o) => o.id === siteId) ?? null)
      : null;

  if (!siteId || siteId === "new" || !site) {
    return null;
  }

  return <SiteDetailCard session={session} site={site} />;
}
