import { readCachedSession } from "../auth/sessionCache";
import { getAgentOrgs } from "../agent/agentOrgList";
import { getAgentCommission } from "../agent/api";
import { primaryAgentOrgId } from "../agent/org";
import { getMerchantOrgs } from "../merchant/merchantOrgList";
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
import { getPlatformOrgs } from "../platform/platformOrgList";
import { periodWindow, toDateInputValue } from "./dashboardPeriod";
import { getDashboardKpis, prefetchDashboard } from "./dashboardApi";
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
  const week = periodWindow("7d");
  const weekQuery = {
    from: toDateInputValue(week.from),
    to: toDateInputValue(week.to),
  };

  if (portal === "platform") {
    void getPlatformOrgs();
    if (onDashboard) prefetchDashboard(weekQuery);
    return;
  }

  if (portal === "agent") {
    void getAgentOrgs();
    if (onDashboard) {
      const session = readCachedSession();
      const agentId = session ? primaryAgentOrgId(session) : null;
      if (agentId) {
        prefetchDashboard({ ...weekQuery, orgId: agentId });
        void getAgentCommission(agentId).catch(() => undefined);
      }
    }
    return;
  }

  void getMerchantOrgs();
  if (onDashboard) {
    const mtd = periodWindow("mtd");
    void getDashboardKpis({
      from: toDateInputValue(mtd.from),
      to: toDateInputValue(mtd.to),
    }).catch(() => undefined);
    const session = readCachedSession();
    if (session && !sessionIsCashierOnly(session)) {
      const orgId = primaryMerchantOrgId(session);
      if (orgId) {
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
