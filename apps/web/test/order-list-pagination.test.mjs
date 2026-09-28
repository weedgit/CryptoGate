import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

describe("@paymentgate/web order list pagination", () => {
  it("invoice list requests one server page at a time", () => {
    const api = read("src/merchant/api.ts");
    assert.match(api, /listOrdersPage/);
    assert.match(api, /q\.set\("offset"/);
    assert.doesNotMatch(api, /listAllOrders/);
    const page = [
      read("src/shared/InvoiceListPage.tsx"),
      ...readdirSync(join(root, "src/shared/invoiceList")).map((f) =>
        read(`src/shared/invoiceList/${f}`),
      ),
    ].join("\n");
    assert.match(page, /listOrdersPage/);
    assert.match(page, /offset: \(page - 1\) \* INVOICE_PAGE_SIZE/);
    assert.match(page, /OrgListPagination/);
    assert.doesNotMatch(page, /Load more/);
  });

  it("dashboard and detail cards use server aggregates or pages, never full order walks", () => {
    const dashboard = read("src/merchant/DashboardPage.tsx");
    assert.match(dashboard, /getDashboardReports/);
    assert.doesNotMatch(dashboard, /getMerchantOrders\(\)|listAllOrders/);
    const agentDetail = read("src/agent/MerchantDetailCard.tsx");
    assert.match(agentDetail, /getDashboardReports\(/);
    assert.doesNotMatch(agentDetail, /listAllOrders/);
    for (const rel of [
      "src/platform/AgentDetailCard.tsx",
      "src/platform/MerchantDetailCard.tsx",
      "src/platform/SiteDetailCard.tsx",
    ]) {
      const card = read(rel);
      assert.match(card, /data\.metrics/, rel);
      assert.doesNotMatch(card, /data\.orders|SERVICE_BILLS_LIST_LIMIT/, rel);
    }
  });
});
