/** Warm lazy route chunks before navigation (nav hover / focus). */
const warm = (loader: () => Promise<unknown>) => {
  void loader();
};

export function prefetchPlatformRoute(path: string) {
  if (path === "architecture") warm(() => import("./ArchitecturePage"));
  else if (path === "agents" || path.startsWith("agents/"))
    warm(() => import("./AgentsListPage"));
  else if (path === "merchants" || path.startsWith("merchants/"))
    warm(() => import("./MerchantsListPage"));
  else if (path === "service-bills") warm(() => import("./ServiceBillsListPage"));
  else if (path === "audit") warm(() => import("./AuditLogPage"));
  else if (path === "compliance") warm(() => import("./CompliancePage"));
  else if (path === "commissions") warm(() => import("./PlatformCommissionsPage"));
  else if (path === "settings/networks") warm(() => import("./NetworkCatalogPage"));
  else if (path === "settings/team") warm(() => import("./PlatformTeamPage"));
  else if (path === "settings/fee-tiers") warm(() => import("./FeeTiersSettingsPage"));
  else if (path === "ops/health") warm(() => import("./SystemHealthPage"));
}
