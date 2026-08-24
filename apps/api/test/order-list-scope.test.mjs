import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orgIdInPaymentOrderFilter } from "../src/orders/order-list-scope.mjs";

describe("orgIdInPaymentOrderFilter", () => {
  it("allows any org for platform-wide lists", () => {
    assert.equal(orgIdInPaymentOrderFilter({ kind: "all" }, "m1"), true);
  });

  it("denies agent-none and orgs outside tree or cashier memberships", () => {
    assert.equal(orgIdInPaymentOrderFilter({ kind: "none" }, "m1"), false);
    assert.equal(
      orgIdInPaymentOrderFilter(
        { kind: "filter", treeOrgIds: ["m1", "s1"], cashierOrgIds: ["c1"] },
        "m2",
      ),
      false,
    );
    assert.equal(
      orgIdInPaymentOrderFilter(
        { kind: "filter", treeOrgIds: ["m1"], cashierOrgIds: [] },
        "m1",
      ),
      true,
    );
    assert.equal(
      orgIdInPaymentOrderFilter(
        { kind: "filter", treeOrgIds: [], cashierOrgIds: ["c1"] },
        "c1",
      ),
      true,
    );
  });
});
