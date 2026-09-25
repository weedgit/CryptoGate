import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  commissionPaidAgingDays,
  formatCommissionPaidAgingHint,
} from "../src/commercial/commissionAging.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("@paymentgate/web commission ops hardening", () => {
  it("wires optional txRef on platform Confirm & pay", () => {
    const detail = readFileSync(
      join(root, "src/platform/CommissionInvoiceDetailPage.tsx"),
      "utf8",
    );
    assert.match(detail, /paidTxRef/);
    assert.match(detail, /Tx hash \/ payment ref/);
    assert.match(detail, /txRef:\s*paidTxRef\.trim\(\)/);
  });

  it("wires invoice status pills, aging, and last auto-run banner", () => {
    const page = readFileSync(
      join(root, "src/platform/PlatformCommissionsPage.tsx"),
      "utf8",
    );
    assert.match(page, /Awaiting/);
    assert.doesNotMatch(page, /Awaiting confirm/);
    assert.match(page, /statusFilter/);
    assert.match(page, /formatCommissionPaidAgingHint/);
    assert.match(page, /commissionPaidIsAging/);
    assert.match(page, /refreshStatusCounts/);
    assert.match(page, /stuckPaidCount/);
    assert.match(page, /plat-commissions__aging-banner/);
    assert.match(page, /commission_payout_auto/);
    assert.match(page, /formatLastAutoRunBanner/);
    assert.match(page, /skipped_zero/);
    assert.match(page, /displayServiceBillTxHash/);
    assert.match(page, /plat-commissions__rate-cell/);
    assert.match(page, /label=\"Rate\"/);
    assert.match(page, /label=\"Period\"/);
  });

  it("formats paid aging after 7 days", () => {
    const now = Date.parse("2026-09-25T00:00:00.000Z");
    const paidAt = "2026-09-10T00:00:00.000Z";
    assert.equal(commissionPaidAgingDays(paidAt, now), 15);
    assert.equal(
      formatCommissionPaidAgingHint(paidAt, now),
      "Paid 15d — awaiting agent",
    );
    assert.equal(
      formatCommissionPaidAgingHint("2026-09-20T00:00:00.000Z", now),
      null,
    );
  });
});
