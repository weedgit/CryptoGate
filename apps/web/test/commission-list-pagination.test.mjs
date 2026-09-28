import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readCommissionsSources() {
  const dir = join(root, "src/platform/commissions");
  return [
    readFileSync(join(root, "src/platform/PlatformCommissionsPage.tsx"), "utf8"),
    ...readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8")),
  ].join("\n");
}

describe("@paymentgate/web commission list pagination", () => {
  it("client listCommissionPayouts sends status/limit/offset and returns page meta", () => {
    const client = readFileSync(
      join(root, "src/commercial/commissionPayoutRecords.ts"),
      "utf8",
    );
    assert.match(client, /q\.set\("status"/);
    assert.match(client, /q\.set\("limit"/);
    assert.match(client, /q\.set\("offset"/);
    assert.match(client, /total: data\.total/);
    assert.match(client, /items: rows/);
  });

  it("server client sends status/search/sort/paging and reads a separate summary", () => {
    const client = readFileSync(join(root, "src/shared/commissionsServer.ts"), "utf8");
    assert.match(client, /status:/);
    assert.match(client, /q: p\.q/);
    assert.match(client, /agingFirst/);
    assert.match(client, /limit: p\.limit/);
    assert.match(client, /offset: p\.offset/);
    assert.match(client, /\/summary/);
  });

  it("platform commissions page shows one server page at a time (no Load more)", () => {
    const page = readCommissionsSources();
    assert.match(page, /status: listStatusForView\(statusFilter\)/);
    assert.match(page, /listCommissionPayoutsServer/);
    assert.match(page, /getCommissionPayoutsSummary/);
    assert.match(page, /offset: \(page - 1\) \* PAGE_SIZE/);
    assert.match(page, /OrgListPagination/);
    assert.match(page, /useDebouncedValue/);
    assert.match(page, /findPayout/);
    assert.doesNotMatch(page, /Load more|hasMoreServer|FETCH_PAGE|countStuckPaidAcrossPages/);
  });

  it("agent commissions reuse the platform page scoped to the agent payee", () => {
    const page = readFileSync(join(root, "src/agent/CommissionsPage.tsx"), "utf8");
    assert.match(page, /PlatformCommissionsPage/);
    assert.match(page, /useAgentCommissionsPortal/);
    const platform = readCommissionsSources();
    assert.match(platform, /payeeOrgId: portal\.payeeOrgId/);
  });
});
