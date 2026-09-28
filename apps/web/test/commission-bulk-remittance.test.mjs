import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

describe("@paymentgate/web commission remittance (one invoice at a time)", () => {
  it("has no multi-select or bulk mark-paid on the platform list", () => {
    const page = readCommissionsSources();
    assert.doesNotMatch(page, /BulkMarkPaidModal|selectedIds|toggleSelected|type="checkbox"/);
    assert.doesNotMatch(page, /markCommissionPayoutsPaidBatch|BATCH_MARK_PAID_MAX/);
    assert.equal(existsSync(join(root, "src/platform/BulkMarkPaidModal.tsx")), false);
    const api = readFileSync(join(root, "src/commercial/commissionPayoutRecords.ts"), "utf8");
    assert.doesNotMatch(api, /mark-paid-batch/);
  });

  it("links each invoice to the merchant bills paid that month (fee base review)", () => {
    const table = readFileSync(
      join(root, "src/platform/commissions/OpenInvoicesTable.tsx"),
      "utf8",
    );
    assert.match(table, /agent: row\.payeeOrgId,\s*paidMonth: row\.periodKey/);
    assert.match(table, /Review →/);
    const bills = readFileSync(join(root, "src/platform/ServiceBillsListPage.tsx"), "utf8");
    assert.match(bills, /searchParams\.get\("paidMonth"\)/);
    assert.match(bills, /commission base/);
    const server = readFileSync(join(root, "src/shared/serviceBillsServer.ts"), "utf8");
    assert.match(server, /paidMonth: p\.paidMonth/);
  });
});
