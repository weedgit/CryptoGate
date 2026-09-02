import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appendPaymentOrderScope } from "../src/orders/order-scope-sql.mjs";
import { summarizePaymentOrders } from "../src/orders/order-summary-store.mjs";

describe("payment order scope SQL", () => {
  it("marks empty scoped filters as empty", () => {
    const params = [];
    const result = appendPaymentOrderScope(
      { kind: "filter", treeOrgIds: [], cashierOrgIds: [] },
      params,
    );
    assert.equal(result.empty, true);
    assert.equal(result.clause, "");
    assert.deepEqual(params, []);
  });

  it("adds cashier created_by predicate", () => {
    const params = [];
    const result = appendPaymentOrderScope(
      {
        kind: "filter",
        cashierOrgIds: ["org-1"],
        createdBy: "user-1",
      },
      params,
    );
    assert.equal(result.empty, false);
    assert.match(result.clause, /created_by = \$2/);
    assert.deepEqual(params, [["org-1"], "user-1"]);
  });
});

describe("summarizePaymentOrders", () => {
  it("returns empty summary for empty scoped filter", async () => {
    const summary = await summarizePaymentOrders({
      kind: "filter",
      treeOrgIds: [],
      cashierOrgIds: [],
      createdBy: "user-1",
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-01-31T23:59:59.999Z"),
    });
    assert.equal(summary.periodVolume, "0");
    assert.deepEqual(summary.volumeByDay, []);
    assert.deepEqual(summary.volumeByOrg, []);
    assert.deepEqual(summary.anomalies, []);
  });
});
