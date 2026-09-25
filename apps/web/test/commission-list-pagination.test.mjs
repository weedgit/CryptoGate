import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

  it("platform commissions page refetches by tab/pill status", () => {
    const page = readFileSync(
      join(root, "src/platform/PlatformCommissionsPage.tsx"),
      "utf8",
    );
    assert.match(page, /listStatusForView/);
    assert.match(page, /status: listStatusForView\(tab, invoiceStatusFilter\)/);
    assert.match(page, /FETCH_PAGE/);
    assert.match(page, /offset: platformPayouts\.length/);
    assert.match(page, /Load more/);
    assert.match(page, /hasMoreServer/);
    assert.match(page, /findPayout/);
    assert.match(page, /refreshStuckPaidCount/);
    assert.match(page, /countStuckPaidAcrossPages/);
  });

  it("agent commissions page uses status-scoped fetch, search, and Load more", () => {
    const page = readFileSync(
      join(root, "src/agent/CommissionsPage.tsx"),
      "utf8",
    );
    assert.match(page, /listStatusForTab/);
    assert.match(page, /status: listStatusForTab\(tab\)/);
    assert.match(page, /FETCH_PAGE/);
    assert.match(page, /offset: platformInvoices\.length/);
    assert.match(page, /Load more/);
    assert.match(page, /hasMoreServer/);
    assert.match(page, /findPayout/);
    assert.match(page, /Search period, status, or ref/);
    assert.doesNotMatch(page, /limit: 500/);
  });
});
