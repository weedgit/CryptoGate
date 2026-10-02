import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { subjectOrgSetupStatus } from "../src/shared/subjectOrgSetup.ts";

describe("subjectOrgSetupStatus", () => {
  const completeOwner = {
    emailVerified: true,
    phoneVerified: true,
    firstName: "Ada",
    lastName: "Lovelace",
  };

  it("agent ready when 6 fields present (no country, no person timezone)", () => {
    const r = subjectOrgSetupStatus({
      kind: "agent",
      name: "Acme Agent",
      billingEmail: "bill@acme.example",
      country: null,
      owner: completeOwner,
      walletSet: true,
    });
    assert.equal(r.total, 6);
    assert.equal(r.done, 6);
    assert.equal(r.ready, true);
    assert.deepEqual(r.missing, []);
  });

  it("merchant requires country as 7th check", () => {
    const incomplete = subjectOrgSetupStatus({
      kind: "merchant",
      name: "Shop",
      billingEmail: "bill@shop.example",
      country: "",
      owner: completeOwner,
      walletSet: true,
    });
    assert.equal(incomplete.total, 7);
    assert.equal(incomplete.ready, false);
    assert.ok(incomplete.missing.includes("Country"));

    const ready = subjectOrgSetupStatus({
      kind: "merchant",
      name: "Shop",
      billingEmail: "bill@shop.example",
      country: "AU",
      owner: completeOwner,
      walletSet: true,
    });
    assert.equal(ready.ready, true);
    assert.equal(ready.done, 7);
  });

  it("lists missing labels for wallet, billing, and owner name", () => {
    const r = subjectOrgSetupStatus({
      kind: "agent",
      name: "Acme",
      billingEmail: "not-an-email",
      owner: {
        emailVerified: false,
        phoneVerified: true,
        firstName: "Ada",
        lastName: "",
      },
      walletSet: false,
    });
    assert.equal(r.ready, false);
    assert.equal(r.missing.filter((m) => m === "Email").length, 2);
    assert.ok(r.missing.includes("Owner"));
    assert.ok(!r.missing.includes("Timezone"));
    assert.ok(r.missing.includes("Wallet"));
  });
});
