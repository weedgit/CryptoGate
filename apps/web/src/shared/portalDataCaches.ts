import { readCachedSession } from "../auth/sessionCache";
import { invalidateAgentOrdersList } from "../agent/agentOrdersList";
import { invalidateAgentOrgList } from "../agent/agentOrgList";
import { invalidateAgentServiceBillsList } from "../agent/agentServiceBillsList";
import { invalidateMerchantIntegrations } from "../merchant/merchantIntegrationsCache";
import { invalidateMerchantOrdersList } from "../merchant/merchantOrdersList";
import { invalidateMerchantOrgList } from "../merchant/merchantOrgList";
import { invalidateMerchantServiceBillsList } from "../merchant/merchantServiceBillsList";
import { invalidatePlatformOrdersList } from "../platform/platformOrdersList";
import { invalidatePlatformOrgList } from "../platform/platformOrgList";
import { invalidatePlatformServiceBillsList } from "../platform/platformServiceBillsList";
import { invalidateAllEntityCaches } from "./entityCache";

const PERSISTED_PREFIXES = [
  "paymentgate.merchant.",
  "paymentgate.agent.",
  "paymentgate.platform.",
  "paymentgate.org-users",
  "paymentgate.service-bill",
];

/** Drop sessionStorage list/detail caches for every portal. */
export function clearPersistedPortalDataCaches(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (PERSISTED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    /* sessionStorage unavailable */
  }
}

/** Invalidate in-memory list caches and persisted portal data. */
export function invalidateAllPortalDataCaches(): void {
  invalidateMerchantOrdersList();
  invalidateMerchantOrgList();
  invalidateMerchantServiceBillsList();
  invalidateAgentOrdersList();
  invalidateAgentOrgList();
  invalidateAgentServiceBillsList();
  invalidatePlatformOrdersList();
  invalidatePlatformOrgList();
  invalidatePlatformServiceBillsList();
  invalidateAllEntityCaches();
  clearPersistedPortalDataCaches();
}

/**
 * Invalidate integration cache for the active merchant org, if any.
 * Call after API key / webhook mutations.
 */
export function invalidateActiveMerchantIntegrations(orgId?: string | null): void {
  if (orgId) {
    invalidateMerchantIntegrations(orgId);
    return;
  }
  const session = readCachedSession();
  if (!session) return;
  for (const membership of session.memberships) {
    if (
      membership.orgType === "merchant" ||
      membership.orgType === "merchant_site"
    ) {
      invalidateMerchantIntegrations(membership.orgId);
    }
  }
}
