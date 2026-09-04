import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeAuditMetadata } from "../src/audit/audit-rules.mjs";

describe("sanitizeAuditMetadata", () => {
  it("keeps deletedOrgIds string arrays for org delete audits", () => {
    const out = sanitizeAuditMetadata({
      deletedOrgId: "site-1",
      deletedOrgIds: ["site-1"],
      cascade: true,
      orgCount: 1,
    });
    assert.deepEqual(out.deletedOrgIds, ["site-1"]);
    assert.equal(out.deletedOrgId, "site-1");
    assert.equal(out.cascade, true);
    assert.equal(out.orgCount, 1);
  });

  it("keeps initialSignIn for agent invite recovery but strips password-like keys", () => {
    const out = sanitizeAuditMetadata({
      email: "owner@agent.io",
      provisioned: true,
      initialSignIn: "abc123XYZ9aA!",
      temporaryPassword: "must-not-persist",
      inviteToken: "must-not-persist",
    });
    assert.equal(out.initialSignIn, "abc123XYZ9aA!");
    assert.equal(out.temporaryPassword, undefined);
    assert.equal(out.inviteToken, undefined);
  });
});
