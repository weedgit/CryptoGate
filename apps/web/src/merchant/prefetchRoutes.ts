/** Warm lazy route chunks and list caches before navigation (nav hover / focus). */
import { prefetchMerchantNavData } from "../shared/prefetchPortalNavData";

const warm = (loader: () => Promise<unknown>) => {
  void loader();
};

export function prefetchMerchantRoute(path: string) {
  prefetchMerchantNavData(path);
  if (path === "orders" || path.startsWith("orders/"))    warm(() => import("./MerchantOrdersRoutes"));
  else if (path === "service-bills" || path.startsWith("service-bills/"))
    warm(() => import("./ServiceBillsListPage"));
  else if (path === "sites" || path.startsWith("sites/"))
    warm(() => import("./MerchantSitesRoutes"));
  else if (path === "reports" || path.startsWith("reports/"))
    warm(() => import("./ReportsPage"));
  else if (path === "networks") warm(() => import("./NetworksPage"));
  else if (path === "settings/settlement") warm(() => import("./SettlementPage"));
  else if (path === "settings/team") warm(() => import("./TeamSettingsPage"));
  else if (path === "settings/integrations")
    warm(() => import("./IntegrationsPage"));
  else if (path === "settings/notifications")
    warm(() => import("./NotificationsSettingsPage"));
}
