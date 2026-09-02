/** Warm lazy route chunks and list caches before navigation (nav hover / focus). */
import { prefetchPlatformNavData } from "../shared/prefetchPortalNavData";

const warm = (loader: () => Promise<unknown>) => {
  void loader();
};

const prefetchPlatformOnboardAgent = () => void import("./OnboardAgentPage");
const prefetchPlatformOnboardMerchant = () => void import("./OnboardMerchantPage");

export function prefetchPlatformRoute(path: string) {
  prefetchPlatformNavData(path);
  if (path === "architecture") warm(() => import("./ArchitecturePage"));
  else if (path === "agents/new" || path.startsWith("agents/new"))
    prefetchPlatformOnboardAgent();
  else if (path === "agents" || path.startsWith("agents/"))
    warm(() => import("./PlatformAgentsRoutes"));
  else if (path === "merchants/new" || path.startsWith("merchants/new"))
    prefetchPlatformOnboardMerchant();
  else if (path === "merchants" || path.startsWith("merchants/"))
    warm(() => import("./PlatformMerchantsRoutes"));
  else if (path === "service-bills") warm(() => import("./ServiceBillsListPage"));
  else if (path === "audit") warm(() => import("./AuditLogPage"));
  else if (path === "compliance") warm(() => import("./CompliancePage"));
  else if (path === "commissions") warm(() => import("./PlatformCommissionsPage"));
  else if (path === "settings/networks") warm(() => import("./NetworkCatalogPage"));
  else if (path === "settings/team") warm(() => import("./PlatformTeamPage"));
  else if (path === "settings/fee-tiers") warm(() => import("./FeeTiersSettingsPage"));
  else if (path === "ops/health") warm(() => import("./SystemHealthPage"));
}
