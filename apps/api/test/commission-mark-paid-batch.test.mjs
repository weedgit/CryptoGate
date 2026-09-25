import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("commission mark-paid-batch wiring", () => {
  it("exposes batch route handler and audit action", () => {
    const routes = readFileSync(
      join(apiRoot, "src/commercial/commission-payout-routes.mjs"),
      "utf8",
    );
    assert.match(routes, /handleMarkCommissionPayoutPaidBatch/);
    assert.match(routes, /MARK_PAID_BATCH_MAX = 50/);
    assert.match(routes, /commissionPayoutMarkPaidBatch/);

    const app = readFileSync(join(apiRoot, "src/http/app.mjs"), "utf8");
    assert.match(app, /commission-payouts\/mark-paid-batch/);
    assert.match(app, /handleMarkCommissionPayoutPaidBatch/);

    const audit = readFileSync(join(apiRoot, "src/audit/audit-rules.mjs"), "utf8");
    assert.match(audit, /commission_payout_mark_paid_batch/);
  });
});
