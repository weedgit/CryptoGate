import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("@paymentgate/web commission bulk remittance", () => {
  it("wires batch client helper", () => {
    const api = readFileSync(
      join(root, "src/commercial/commissionPayoutRecords.ts"),
      "utf8",
    );
    assert.match(api, /markCommissionPayoutsPaidBatch/);
    assert.match(api, /mark-paid-batch/);
  });

  it("wires multi-select and bulk modal on platform list", () => {
    const page = readFileSync(
      join(root, "src/platform/PlatformCommissionsPage.tsx"),
      "utf8",
    );
    assert.match(page, /BulkMarkPaidModal/);
    assert.match(page, /selectedIds/);
    assert.match(page, /markCommissionPayoutsPaidBatch/);
    assert.match(page, /Confirm &amp; pay/);
    assert.match(page, /BATCH_MARK_PAID_MAX/);

    const modal = readFileSync(
      join(root, "src/platform/BulkMarkPaidModal.tsx"),
      "utf8",
    );
    assert.match(modal, /Tx hash \/ payment ref/);
    assert.match(modal, /note/);
  });
});
