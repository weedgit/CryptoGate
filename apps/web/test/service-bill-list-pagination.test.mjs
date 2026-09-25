import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("@paymentgate/web service bill list pagination", () => {
  it("clients send limit/offset and platform list has Load more", () => {
    const platformApi = readFileSync(
      join(root, "src/platform/api.ts"),
      "utf8",
    );
    assert.match(platformApi, /listServiceBillsPage/);
    assert.match(platformApi, /q\.set\("offset"/);
    const merchantApi = readFileSync(
      join(root, "src/merchant/api.ts"),
      "utf8",
    );
    assert.match(merchantApi, /listServiceBillsPage/);
    assert.match(merchantApi, /SERVICE_BILLS_LIST_LIMIT/);
    assert.match(merchantApi, /opts\?\.limit \?\? SERVICE_BILLS_LIST_LIMIT/);
    const merchantCache = readFileSync(
      join(root, "src/merchant/merchantServiceBillsList.ts"),
      "utf8",
    );
    assert.match(merchantCache, /limit: SERVICE_BILLS_LIST_LIMIT/);
    const platformPage = readFileSync(
      join(root, "src/platform/ServiceBillsListPage.tsx"),
      "utf8",
    );
    assert.match(platformPage, /listServiceBillsPage/);
    assert.match(platformPage, /Load more/);
    assert.match(platformPage, /hasMoreServer/);
    const agentPage = readFileSync(
      join(root, "src/agent/ServiceBillsListPage.tsx"),
      "utf8",
    );
    assert.match(agentPage, /listServiceBillsPage/);
    assert.match(agentPage, /Load more/);
    const merchantPage = readFileSync(
      join(root, "src/merchant/ServiceBillsListPage.tsx"),
      "utf8",
    );
    assert.match(merchantPage, /listServiceBillsPage/);
    assert.match(merchantPage, /Load more/);
    assert.match(merchantPage, /hasMoreServer/);
  });
});
