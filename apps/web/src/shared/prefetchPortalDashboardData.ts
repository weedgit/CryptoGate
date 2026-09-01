import { readCachedSession } from "../auth/sessionCache";
import { getAgentOrgs } from "../agent/agentOrgList";
import { getAgentOrders } from "../agent/agentOrdersList";
import { getAgentServiceBills } from "../agent/agentServiceBillsList";
import { getAgentCommission } from "../agent/api";
import { primaryAgentOrgId } from "../agent/org";
import { getMerchantOrgs } from "../merchant/merchantOrgList";
import { getMerchantOrders } from "../merchant/merchantOrdersList";
import { getMerchantServiceBills } from "../merchant/merchantServiceBillsList";
import {
  getMerchantCommercial,
  listSettlement,
  listXpub,
} from "../merchant/api";
import {
  parentMerchantOrgId,
  primaryMerchantOrgId,
  sessionIsCashierOnly,
} from "../merchant/org";
import { getPlatformDashboardSummary } from "../platform/api";
import { getPlatformOrgs } from "../platform/platformOrgList";
import { getPlatformOrders } from "../platform/platformOrdersList";
import { getPlatformServiceBills } from "../platform/platformServiceBillsList";
import { periodWindow } from "./dashboardPeriod";
import { getPortal, isDedicatedPortalHost } from "./portalRouting";

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

function isDashboardRoute(subpath: string): boolean {
  return subpath === "";
}

/** Warm shared list caches and dashboard APIs during session restore. */
export function prefetchPortalDashboardData(): void {
  if (typeof window === "undefined") return;
  if (!readCachedSession()) return;

  const portal = getPortal();
  const sub = portalSubpath();
  const onDashboard = isDashboardRoute(sub);
  const { from, to } = periodWindow("7d");

  if (portal === "platform") {
    void getPlatformOrgs();
    void getPlatformServiceBills();
    if (onDashboard) {
      void getPlatformOrders();
      void getPlatformDashboardSummary(
        from.toISOString(),
        to.toISOString(),
      ).catch(() => undefined);
    }
    return;
  }

  if (portal === "agent") {
    void getAgentOrgs();
    void getAgentServiceBills();
    if (onDashboard) {
      void getAgentOrders();
      const session = readCachedSession();
      const agentId = session ? primaryAgentOrgId(session) : null;
      if (agentId) {
        void getAgentCommission(agentId).catch(() => undefined);
      }
    }
    return;
  }

  void getMerchantOrgs();
  if (onDashboard) {
    void getMerchantOrders();
    const session = readCachedSession();
    if (session && !sessionIsCashierOnly(session)) {
      const orgId = primaryMerchantOrgId(session);
      if (orgId) {
        void getMerchantServiceBills().catch(() => undefined);
        void getMerchantCommercial(orgId).catch(() => undefined);
        void listSettlement(orgId).catch(() => undefined);
        void listXpub(orgId).catch(() => undefined);
      }
      if (parentIdOrRoot(session)) {
        void getMerchantOrgs();
      }
    }
  }
}

function parentIdOrRoot(session: NonNullable<ReturnType<typeof readCachedSession>>) {
  return parentMerchantOrgId(session) ?? primaryMerchantOrgId(session);
}
