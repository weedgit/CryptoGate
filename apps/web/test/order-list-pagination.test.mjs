import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("@paymentgate/web order list pagination", () => {
  it("client listOrdersPage + merchant OrdersListPage Load more", () => {
    const api = readFileSync(join(root, "src/merchant/api.ts"), "utf8");
    assert.match(api, /listOrdersPage/);
    assert.match(api, /listAllOrders/);
    assert.match(api, /q\.set\("offset"/);
    const page = readFileSync(
      join(root, "src/merchant/OrdersListPage.tsx"),
      "utf8",
    );
    assert.match(page, /listOrdersPage/);
    assert.match(page, /Load more/);
    assert.match(page, /hasMoreServer/);
    assert.match(page, /FETCH_PAGE/);
    const reports = readFileSync(
      join(root, "src/merchant/ReportsPage.tsx"),
      "utf8",
    );
    assert.match(reports, /listAllOrders/);
    assert.doesNotMatch(reports, /listOrders\(\{\s*limit: 200/);
    assert.doesNotMatch(reports, /getMerchantOrders\(\)/);
    const agentDetail = readFileSync(
      join(root, "src/agent/MerchantDetailCard.tsx"),
      "utf8",
    );
    assert.match(agentDetail, /listAllOrders\(\{\s*orgId/);
    assert.doesNotMatch(agentDetail, /listOrders\(\{\s*orgId: org\.id, limit: 200/);
    const siteDetail = readFileSync(
      join(root, "src/merchant/SiteDetailCard.tsx"),
      "utf8",
    );
    assert.match(siteDetail, /listAllOrders\(\{\s*orgId: site\.id/);
  });
});
