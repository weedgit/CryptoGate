import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

describe("@paymentgate/web service bill list pagination", () => {
  it("client requests one server page with filter/sort/search and a separate summary", () => {
    const client = read("src/shared/serviceBillsServer.ts");
    assert.match(client, /limit: p\.limit/);
    assert.match(client, /offset: p\.offset/);
    assert.match(client, /bucket/);
    assert.match(client, /sort/);
    assert.match(client, /\/service-bills\/summary/);
    assert.match(client, /\/service-bills\/org-status/);
  });

  it("platform + agent list page numbers come from the server total (no Load more)", () => {
    const platformPage = read("src/platform/ServiceBillsListPage.tsx");
    assert.match(platformPage, /listServiceBillsServer/);
    assert.match(platformPage, /getServiceBillsSummary/);
    assert.match(platformPage, /OrgListPagination/);
    assert.match(platformPage, /useDebouncedValue/);
    assert.doesNotMatch(platformPage, /Load more/);
    assert.doesNotMatch(platformPage, /hasMoreServer/);
    const agentPage = read("src/agent/ServiceBillsListPage.tsx");
    assert.match(agentPage, /PlatformServiceBillsListPage/);
  });

  it("merchant list is server paged too", () => {
    const merchantPage = read("src/merchant/ServiceBillsListPage.tsx");
    assert.match(merchantPage, /listServiceBillsServer/);
    assert.match(merchantPage, /OrgListPagination/);
    assert.doesNotMatch(merchantPage, /Load more/);
    assert.doesNotMatch(merchantPage, /hasMoreServer/);
  });
});
