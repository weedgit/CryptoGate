import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { subjectOrgSetupStatus } from "../src/shared/subjectOrgSetup.ts";

describe("subjectOrgSetupStatus", () => {
  const completeOwner = {
    emailVerified: true,
    phoneVerified: true,
    firstName: "Ada",
    lastName: "Lovelace",
    timezone: "UTC",
  };

  it("agent ready when 7 fields present (no country)", () => {
    const r = subjectOrgSetupStatus({
      kind: "agent",
      name: "Acme Agent",
      billingEmail: "bill@acme.example",
      country: null,
      owner: completeOwner,
      walletSet: true,
    });
    assert.equal(r.total, 7);
    assert.equal(r.done, 7);
    assert.equal(r.ready, true);
    assert.deepEqual(r.missing, []);
  });

  it("merchant requires country as 8th check", () => {
    const incomplete = subjectOrgSetupStatus({
      kind: "merchant",
      name: "Shop",
      billingEmail: "bill@shop.example",
      country: "",
      owner: completeOwner,
      walletSet: true,
    });
    assert.equal(incomplete.total, 8);
    assert.equal(incomplete.ready, false);
    assert.ok(incomplete.missing.includes("country"));

    const ready = subjectOrgSetupStatus({
      kind: "merchant",
      name: "Shop",
      billingEmail: "bill@shop.example",
      country: "AU",
      owner: completeOwner,
      walletSet: true,
    });
    assert.equal(ready.ready, true);
    assert.equal(ready.done, 8);
  });

  it("lists missing labels for wallet, billing, and timezone", () => {
    const r = subjectOrgSetupStatus({
      kind: "agent",
      name: "Acme",
      billingEmail: "not-an-email",
      owner: {
        emailVerified: false,
        phoneVerified: true,
        firstName: "Ada",
        lastName: "",
        timezone: "",
      },
      walletSet: false,
    });
    assert.equal(r.ready, false);
    assert.ok(r.missing.includes("billing email"));
    assert.ok(r.missing.includes("owner name"));
    assert.ok(r.missing.includes("owner email verified"));
    assert.ok(r.missing.includes("owner timezone"));
    assert.ok(r.missing.includes("payout wallet"));
  });
});
