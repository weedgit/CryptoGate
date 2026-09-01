import {
  listApiKeys,
  listWebhooks,
  type ApiKey,
  type WebhookEndpoint,
} from "./api";
import { createEntityCache } from "../shared/entityCache";

export type MerchantIntegrationsBundle = {
  keys: ApiKey[];
  hooks: WebhookEndpoint[];
};

const integrationsCache = createEntityCache<MerchantIntegrationsBundle>({
  storageKeyPrefix: "cryptogate.merchant.integrations",
  memoryTtlMs: 20_000,
  persistTtlMs: 5 * 60_000,
  fetch: async (orgId) => {
    const [keys, hooks] = await Promise.all([
      listApiKeys(orgId),
      listWebhooks(orgId),
    ]);
    return { keys, hooks };
  },
});

export function peekMerchantIntegrations(
  orgId: string,
): MerchantIntegrationsBundle | null {
  return integrationsCache.peek(orgId);
}

export async function getMerchantIntegrations(
  orgId: string,
  opts?: { force?: boolean },
): Promise<MerchantIntegrationsBundle> {
  return integrationsCache.get(orgId, opts);
}

export function invalidateMerchantIntegrations(orgId: string): void {
  integrationsCache.invalidate(orgId);
}
