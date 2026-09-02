/** Warm lazy route chunks and list caches before navigation (nav hover / focus). */
import { prefetchAgentNavData } from "../shared/prefetchPortalNavData";

const warm = (loader: () => Promise<unknown>) => {
  void loader();
};

const prefetchAgentOnboardMerchant = () => void import("./OnboardMerchantPage");
const prefetchAgentOnboardSubAgent = () => void import("./OnboardSubAgentPage");

export function prefetchAgentRoute(path: string) {
  prefetchAgentNavData(path);
  if (path === "architecture") warm(() => import("./ArchitecturePage"));
  else if (path === "merchants/new" || path.startsWith("merchants/new"))
    prefetchAgentOnboardMerchant();
  else if (path === "merchants" || path.startsWith("merchants/"))
    warm(() => import("./AgentMerchantsRoutes"));
  else if (path === "agents/new" || path.startsWith("agents/new"))
    prefetchAgentOnboardSubAgent();
  else if (path === "agents" || path.startsWith("agents/"))
    warm(() => import("./AgentSubAgentsRoutes"));
  else if (path === "service-bills" || path.startsWith("service-bills/"))
    warm(() => import("./ServiceBillsListPage"));
  else if (path === "commissions") warm(() => import("./CommissionsPage"));
  else if (path === "settings/team") warm(() => import("./TeamSettingsPage"));
  else if (path === "settings") warm(() => import("./AgentSettingsPage"));
}
