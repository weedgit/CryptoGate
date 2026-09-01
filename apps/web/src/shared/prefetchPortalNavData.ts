import { readCachedSession } from "../auth/sessionCache";
import { getAgentPayout } from "../agent/api";
import { getAgentOrgs } from "../agent/agentOrgList";
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
import { getMerchantOrders } from "../merchant/merchantOrdersList";
import { getMerchantServiceBills } from "../merchant/merchantServiceBillsList";
import { primaryMerchantOrgId } from "../merchant/org";
import { getPlatformOrgs } from "../platform/platformOrgList";
import { getPlatformOrders } from "../platform/platformOrdersList";
import { getPlatformServiceBills } from "../platform/platformServiceBillsList";
import { getCachedServiceBill } from "./serviceBillDetailCache";
import { getOrgUsers } from "./orgUsersCache";

function isPortalRoot(path: string, portal: "platform" | "agent" | "merchant"): boolean {
  return path === "" || path === portal;
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
    path === "architecture" ||
    path.startsWith("agents") ||
    path.startsWith("merchants")
  ) {
    void getPlatformOrgs();
  }
  if (
    path === "agents" ||
    path.startsWith("agents/") ||
    path === "merchants" ||
    path.startsWith("merchants/") ||
    path === "service-bills" ||
    path.startsWith("service-bills/") ||
    path === "commissions"
  ) {
    void getPlatformServiceBills();
  }
  if (path === "compliance") {
    void getPlatformOrders();
    void listOrders({ status: "payment_anomaly", limit: 200 }).catch(
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
  if (
    path === "agents" ||
    path.startsWith("agents/") ||
    path === "merchants" ||
    path.startsWith("merchants/") ||
    path === "service-bills" ||
    path.startsWith("service-bills/") ||
    path === "commissions"
  ) {
    void getAgentServiceBills();
  }
  if (isPortalRoot(path, "agent") || path === "commissions") {
    void getAgentOrders();
  }
  prefetchServiceBillDetail(path);
  prefetchAgentSettings(path);
}

export function prefetchMerchantNavData(path: string) {
  if (
    isPortalRoot(path, "merchant") ||
    path === "orders" ||
    path.startsWith("orders/") ||
    path === "reports" ||
    path.startsWith("reports/") ||
    path === "sites" ||
    path.startsWith("sites/")
  ) {
    void getMerchantOrders();
  }
  if (
    path === "reports" ||
    path.startsWith("reports/") ||
    path === "sites" ||
    path.startsWith("sites/")
  ) {
    void getMerchantOrgs();
  }
  if (path === "service-bills" || path.startsWith("service-bills/")) {
    void getMerchantServiceBills();
  }
  prefetchOrderDetail(path);
  prefetchServiceBillDetail(path);
  prefetchMerchantSettings(path);
}
