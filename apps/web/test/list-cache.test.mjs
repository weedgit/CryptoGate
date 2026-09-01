import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("persisted list caches", () => {
  it("stores org and bill lists in sessionStorage with stale-while-revalidate", () => {
    const listCache = readFileSync(
      join(root, "src/shared/listCache.ts"),
      "utf8",
    );
    assert.match(listCache, /readPersistedCache/);
    assert.match(listCache, /writePersistedCache/);
    assert.match(listCache, /void refresh\(\)\.catch/);

    const platformOrgs = readFileSync(
      join(root, "src/platform/platformOrgList.ts"),
      "utf8",
    );
    assert.match(platformOrgs, /createListCache/);
    assert.match(platformOrgs, /cryptogate\.platform\.orgs/);

    const agentOrgs = readFileSync(
      join(root, "src/agent/agentOrgList.ts"),
      "utf8",
    );
    assert.match(agentOrgs, /cryptogate\.agent\.orgs/);

    const merchantOrgs = readFileSync(
      join(root, "src/merchant/merchantOrgList.ts"),
      "utf8",
    );
    assert.match(merchantOrgs, /cryptogate\.merchant\.orgs/);
  });

  it("prefetches dashboard APIs during session restore", () => {
    const boot = readFileSync(join(root, "src/auth/usePortalBoot.ts"), "utf8");
    assert.match(boot, /prefetchPortalDashboardData/);

    const prefetch = readFileSync(
      join(root, "src/shared/prefetchPortalDashboardData.ts"),
      "utf8",
    );
    assert.match(prefetch, /getPlatformOrgs/);
    assert.match(prefetch, /getPlatformOrders/);
    assert.match(prefetch, /getAgentOrgs/);
    assert.match(prefetch, /getMerchantOrders/);

    const navPrefetch = readFileSync(
      join(root, "src/shared/prefetchPortalNavData.ts"),
      "utf8",
    );
    assert.match(navPrefetch, /prefetchPlatformNavData/);
    assert.match(navPrefetch, /prefetchAgentNavData/);
    assert.match(navPrefetch, /prefetchMerchantNavData/);
    assert.match(navPrefetch, /getPlatformOrgs/);
    assert.match(navPrefetch, /getAgentOrgs/);
    assert.match(navPrefetch, /getMerchantOrders/);
    assert.match(navPrefetch, /getCachedServiceBill/);
    assert.match(navPrefetch, /getMerchantOrder/);

    const entityCache = readFileSync(
      join(root, "src/shared/entityCache.ts"),
      "utf8",
    );
    assert.match(entityCache, /createEntityCache/);

    const orderDetail = readFileSync(
      join(root, "src/merchant/merchantOrderDetail.ts"),
      "utf8",
    );
    assert.match(orderDetail, /peekMerchantOrderInList/);

    const paymentDetail = readFileSync(
      join(root, "src/merchant/merchantOrderPaymentDetails.ts"),
      "utf8",
    );
    assert.match(paymentDetail, /getMerchantOrderPayment/);

    const orgUsers = readFileSync(
      join(root, "src/shared/orgUsersCache.ts"),
      "utf8",
    );
    assert.match(orgUsers, /getOrgUsers/);
  });
});
