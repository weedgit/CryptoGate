import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findBillingMerchantOrg } from "../src/orgs/org-ancestry.mjs";

const merchant = {
  id: "m1",
  type: "merchant",
  parent_id: "a1",
};

const site = {
  id: "s1",
  type: "merchant_site",
  parent_id: "m1",
};

const nested = {
  id: "s2",
  type: "merchant_site",
  parent_id: "s1",
};

const byId = {
  m1: merchant,
  s1: site,
  s2: nested,
};

describe("findBillingMerchantOrg", () => {
  it("returns merchant for merchant org", async () => {
    const r = await findBillingMerchantOrg(merchant, (id) => byId[id] ?? null);
    assert.equal(r?.id, "m1");
  });

  it("walks nested sites to the billing merchant", async () => {
    const r = await findBillingMerchantOrg(nested, (id) => byId[id] ?? null);
    assert.equal(r?.id, "m1");
  });

  it("returns null for non-merchant/site types", async () => {
    const r = await findBillingMerchantOrg(
      { id: "a1", type: "agent", parent_id: "p1" },
      (id) => byId[id] ?? null,
    );
    assert.equal(r, null);
  });
});
