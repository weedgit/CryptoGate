import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCommissionPreview,
  commissionMonthBounds,
} from "../src/dashboard/commission-preview.mjs";

describe("commission preview", () => {
  it("uses the UTC month and day C of the next month", () => {
    assert.deepEqual(commissionMonthBounds("2026-09", 5), {
      startIso: "2026-09-01T00:00:00.000Z",
      endIso: "2026-10-01T00:00:00.000Z",
      invoiceDate: "2026-10-05",
    });
    assert.equal(commissionMonthBounds("2026-12", 3).invoiceDate, "2027-01-03");
    assert.equal(commissionMonthBounds("2026-09", 0).invoiceDate, "2026-10-01");
  });

  it("merges paid fee base, site orders, and open bills per merchant", () => {
    const out = buildCommissionPreview({
      commissionPercent: "15",
      lines: [
        { orgId: "m1", name: "Alpha", billId: "b1", subscriptionAmount: 50, volumeFeeAmount: 25.5 },
        { orgId: "m2", name: "Beta", billId: null, subscriptionAmount: 0, volumeFeeAmount: 0 },
        { orgId: "m3", name: "Gamma", billId: null, subscriptionAmount: 0, volumeFeeAmount: 0 },
      ],
      orgs: [
        { id: "a", type: "agent", parent_id: null, status: "active" },
        { id: "m1", type: "merchant", parent_id: "a", status: "active" },
        { id: "s1", type: "merchant_site", parent_id: "m1", status: "active" },
        { id: "s2", type: "merchant_site", parent_id: "s1", status: "active" },
        { id: "m2", type: "merchant", parent_id: "a", status: "active" },
        { id: "m3", type: "merchant", parent_id: "a", status: "paused" },
      ],
      orders: [
        { org_id: "m1", count: "2", volume: "100" },
        { org_id: "s2", count: "1", volume: "40.25" },
        { org_id: "m2", count: 3, volume: 60 },
      ],
      openBills: [
        { id: "x1", org_id: "m2", status: "issued", fee: "30", due_at: "2026-10-10T00:00:00Z" },
        { id: "x2", org_id: "m2", status: "overdue", fee: "20", due_at: "2026-09-10T00:00:00Z" },
      ],
    });

    assert.deepEqual(out.merchants.map((m) => m.orgId), ["m1", "m2", "m3"]);
    const [alpha, beta, gamma] = out.merchants;
    assert.equal(alpha.siteCount, 2);
    assert.equal(alpha.transactions, 3);
    assert.equal(alpha.volumeUsd, 140.25);
    assert.equal(alpha.baseUsd, 75.5);
    assert.equal(alpha.commissionUsd, 11.33);
    assert.equal(alpha.paidBillId, "b1");
    assert.equal(alpha.openBill, null);
    assert.equal(beta.status, "active");
    assert.equal(beta.commissionUsd, 0);
    assert.deepEqual(beta.openBill, {
      id: "x2",
      status: "overdue",
      dueAt: "2026-09-10T00:00:00.000Z",
      count: 2,
      amountUsd: 50,
    });
    assert.equal(gamma.status, "paused");
    assert.deepEqual(out.totals, {
      merchants: 3,
      transactions: 6,
      volumeUsd: 200.25,
      baseUsd: 75.5,
      commissionUsd: 11.33,
      openBills: 2,
      openBillsUsd: 50,
    });
  });

  it("marks merchants without orders as idle", () => {
    const out = buildCommissionPreview({
      commissionPercent: "10",
      lines: [{ orgId: "m1", name: "Solo", billId: null, subscriptionAmount: 0, volumeFeeAmount: 0 }],
      orgs: [{ id: "m1", type: "merchant", parent_id: "a", status: "active" }],
      orders: [],
      openBills: [],
    });
    assert.equal(out.merchants[0].status, "idle");
    assert.equal(out.totals.commissionUsd, 0);
    assert.equal(out.merchants[0].iconKey, null);
    assert.equal(out.merchants[0].billingAnchorAt, null);
    assert.equal(out.merchants[0].nextInvoiceOn, null);
  });

  it("adds brand icon and billing schedule per merchant", () => {
    const out = buildCommissionPreview({
      commissionPercent: "10",
      lines: [
        { orgId: "m1", name: "Solo", billId: null, subscriptionAmount: 0, volumeFeeAmount: 0 },
        { orgId: "m2", name: "Odd", billId: null, subscriptionAmount: 0, volumeFeeAmount: 0 },
      ],
      orgs: [
        { id: "m1", type: "merchant", parent_id: "a", status: "active" },
        { id: "m2", type: "merchant", parent_id: "a", status: "active" },
      ],
      orders: [],
      openBills: [],
      profiles: [
        {
          org_id: "m1",
          icon_key: "not a valid icon <script>",
          billing_anchor_at: new Date("2026-03-05T09:30:00Z"),
          next_invoice_on: "2026-10-05",
        },
      ],
    });
    const solo = out.merchants.find((m) => m.orgId === "m1");
    const odd = out.merchants.find((m) => m.orgId === "m2");
    assert.equal(solo.iconKey, null);
    assert.equal(solo.billingAnchorAt, "2026-03-05");
    assert.equal(solo.nextInvoiceOn, "2026-10-05");
    assert.equal(odd.billingAnchorAt, null);
  });
});
