import { readCachedSession } from "../auth/sessionCache";
import { getAgentOrgs } from "../agent/agentOrgList";
import { getAgentPayout } from "../agent/api";
import { primaryAgentOrgId } from "../agent/org";
import {
  getFulfillmentPolicy,
  getMatchingMode,
  getNotificationPreferences,
  listOrders,
  listSettlement,
  listXpub,
} from "../merchant/api";
import { getMerchantIntegrations } from "../merchant/merchantIntegrationsCache";
import { getMerchantOrgs } from "../merchant/merchantOrgList";
import { getMerchantOrder } from "../merchant/merchantOrderDetail";
import { getMerchantOrderPayment } from "../merchant/merchantOrderPaymentDetails";
import { getDashboardReports } from "./dashboardApi";
import { toDateInputValue } from "./dashboardPeriod";
import { primaryMerchantOrgId } from "../merchant/org";
import { getPlatformOrgs } from "../platform/platformOrgList";
import { getCachedServiceBill } from "./serviceBillDetailCache";
import { getOrgUsers } from "./orgUsersCache";
import {
  getServiceBillOrgStatus,
  prefetchServiceBillsList,
} from "./serviceBillsServer";

function isAccountListPath(path: string): boolean {
  return (
    path === "accounts" ||
    path.startsWith("accounts/") ||
    path === "architecture" ||
    path === "agents" ||
    path.startsWith("agents/") ||
    path === "merchants" ||
    path.startsWith("merchants/")
  );
}

function prefetchServiceBillDetail(path: string): void {
  const match = path.match(/^service-bills\/([^/]+)$/);
  if (!match || match[1] === "new") return;
  void getCachedServiceBill(match[1]);
}

function prefetchOrderDetail(path: string): void {
  const match = path.match(/^orders\/([^/]+)$/);
  if (!match || match[1] === "new") return;
  const orderId = match[1];
  void getMerchantOrder(orderId);
  void getMerchantOrderPayment(orderId);
}

function prefetchMerchantSettings(path: string): void {
  if (!path.startsWith("settings/")) return;
  void getMerchantOrgs();
  const session = readCachedSession();
  if (!session) return;
  const orgId = primaryMerchantOrgId(session);
  if (!orgId) return;

  if (path === "settings/team") {
    void getOrgUsers(orgId);
  } else if (path === "settings/integrations") {
    void getMerchantIntegrations(orgId);
  } else if (path === "settings/notifications") {
    void getNotificationPreferences(orgId).catch(() => undefined);
  } else if (path === "settings/settlement") {
    void getMatchingMode(orgId).catch(() => undefined);
    void getFulfillmentPolicy(orgId).catch(() => undefined);
    void listSettlement(orgId).catch(() => undefined);
    void listXpub(orgId).catch(() => undefined);
  }
}

function prefetchAgentSettings(path: string): void {
  if (path !== "settings" && path !== "settings/team") return;
  void getAgentOrgs();
  const session = readCachedSession();
  if (!session) return;
  const agentId = primaryAgentOrgId(session);
  if (!agentId) return;
  if (path === "settings/team") {
    void getOrgUsers(agentId);
  } else {
    void getAgentPayout(agentId).catch(() => undefined);
  }
}

function prefetchPlatformSettings(path: string): void {
  if (path !== "settings/team") return;
  void getPlatformOrgs();
  const session = readCachedSession();
  const orgId =
    session?.memberships.find((m) => m.orgType === "platform")?.orgId ?? null;
  if (orgId) void getOrgUsers(orgId);
}

/** Warm shared list caches before navigation (nav hover / focus). */
export function prefetchPlatformNavData(path: string) {
  if (
    path === "accounts" ||
    path.startsWith("accounts/") ||
    path === "architecture" ||
    path.startsWith("agents") ||
    path.startsWith("merchants")
  ) {
    void getPlatformOrgs();
  }
  if (isAccountListPath(path)) {
    void getServiceBillOrgStatus().catch(() => undefined);
  }
  if (path === "service-bills") prefetchServiceBillsList("platform");
  if (path === "invoices" || path === "support" || path === "compliance") {
    void listOrders({ status: "payment_anomaly", limit: 25 }).catch(
      () => undefined,
    );
  }
  prefetchServiceBillDetail(path);
  prefetchOrderDetail(path);
  prefetchPlatformSettings(path);
}

export function prefetchAgentNavData(path: string) {
  if (
    path === "architecture" ||
    path.startsWith("agents") ||
    path.startsWith("merchants")
  ) {
    void getAgentOrgs();
  }
  if (isAccountListPath(path)) {
    void getServiceBillOrgStatus().catch(() => undefined);
  }
  if (path === "service-bills") prefetchServiceBillsList("agent");
  prefetchServiceBillDetail(path);
  prefetchAgentSettings(path);
}

export function prefetchMerchantNavData(path: string) {
  if (path === "reports") {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 30);
    void getDashboardReports({
      from: toDateInputValue(from),
      to: toDateInputValue(to),
    }).catch(() => undefined);
  }
  if (
    path === "reports" ||
    path.startsWith("reports/") ||
    path === "sites" ||
    path.startsWith("sites/")
  ) {
    void getMerchantOrgs();
  }
  if (path === "service-bills") prefetchServiceBillsList("merchant");
  prefetchOrderDetail(path);
  prefetchServiceBillDetail(path);
  prefetchMerchantSettings(path);
}
