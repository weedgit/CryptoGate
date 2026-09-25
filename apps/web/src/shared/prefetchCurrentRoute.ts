import { getPortal, isDedicatedPortalHost } from "./portalRouting";

const warm = (loader: () => Promise<unknown>) => {
  void loader();
};

function portalSubpath(): string {
  const portal = getPortal();
  const pathname = window.location.pathname.replace(/\/$/, "") || "/";
  if (isDedicatedPortalHost()) {
    return pathname === "/" ? "" : pathname.replace(/^\//, "");
  }
  const prefix = `/${portal}`;
  if (pathname === prefix) return "";
  if (pathname.startsWith(`${prefix}/`)) {
    return pathname.slice(prefix.length + 1);
  }
  return pathname.replace(/^\//, "");
}

function prefetchPlatform(sub: string) {
  if (!sub) warm(() => import("../platform/DashboardPage"));
  else if (
    sub === "accounts" ||
    sub.startsWith("accounts/") ||
    sub === "architecture" ||
    sub.startsWith("agents") ||
    sub.startsWith("merchants")
  ) {
    warm(() => import("../platform/PlatformAccountsRoutes"));
  }
  else if (sub.startsWith("service-bills")) {
    if (sub.includes("/")) warm(() => import("../platform/ServiceBillDetailPage"));
    else warm(() => import("../platform/ServiceBillsListPage"));
  }
  else if (sub === "audit") warm(() => import("../platform/AuditLogPage"));
  else if (sub === "support" || sub === "compliance")
    warm(() => import("../platform/SupportPage"));
  else if (sub.startsWith("commissions")) {
    if (sub.includes("/")) warm(() => import("../platform/CommissionInvoiceDetailPage"));
    else warm(() => import("../platform/PlatformCommissionsPage"));
  }
}

function prefetchAgent(sub: string) {
  if (!sub) warm(() => import("../agent/DashboardPage"));
  else if (sub === "architecture") warm(() => import("../agent/ArchitecturePage"));
  // AgentApp redirects agents/* → merchants.
  else if (sub.startsWith("agents"))
    warm(() => import("../agent/AgentMerchantsRoutes"));
  else if (sub.startsWith("merchants")) warm(() => import("../agent/MerchantsListPage"));
  else if (sub.startsWith("service-bills")) {
    if (sub.includes("/")) warm(() => import("../agent/ServiceBillDetailPage"));
    else warm(() => import("../agent/ServiceBillsListPage"));
  }
  else if (sub.startsWith("commissions")) {
    if (sub.includes("/")) warm(() => import("../agent/CommissionInvoiceDetailPage"));
    else warm(() => import("../agent/CommissionsPage"));
  }
  else if (sub.startsWith("settings")) warm(() => import("../agent/AgentSettingsPage"));
}

function prefetchMerchant(sub: string) {
  if (!sub) warm(() => import("../merchant/DashboardPage"));
  else if (sub.startsWith("orders")) {
    if (sub.includes("/") && !sub.endsWith("/new")) {
      warm(() => import("../merchant/OrderDetailPage"));
    } else {
      warm(() => import("../merchant/OrdersListPage"));
    }
  }
  else if (sub.startsWith("service-bills")) {
    if (sub.includes("/")) warm(() => import("../merchant/ServiceBillDetailPage"));
    else warm(() => import("../merchant/ServiceBillsListPage"));
  }
  else if (sub.startsWith("sites")) warm(() => import("../merchant/SitesListPage"));
  else if (sub.startsWith("settings")) warm(() => import("../merchant/TeamSettingsPage"));
}

/** Warm the lazy page chunk for the current URL during session restore. */
export function prefetchCurrentPortalRoute() {
  if (typeof window === "undefined") return;
  const sub = portalSubpath();
  const portal = getPortal();
  if (portal === "platform") prefetchPlatform(sub);
  else if (portal === "agent") prefetchAgent(sub);
  else prefetchMerchant(sub);
}
