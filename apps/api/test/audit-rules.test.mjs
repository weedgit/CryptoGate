import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AUDIT_ACTIONS,
  sanitizeAuditMetadata,
} from "../src/audit/audit-rules.mjs";

describe("audit metadata sanitizer", () => {
  it("drops secret-like keys and non-scalars", () => {
    assert.deepEqual(
      sanitizeAuditMetadata({
        role: "owner",
        password: "hunter2hunter2",
        token: "abc",
        mfaSecret: "otp",
        nested: { x: 1 },
        invitedUserId: "u-1",
      }),
      { role: "owner", invitedUserId: "u-1" },
    );
  });

  it("returns empty object for invalid input", () => {
    assert.deepEqual(sanitizeAuditMetadata(null), {});
    assert.deepEqual(sanitizeAuditMetadata([]), {});
  });

  it("uses stable action names for login and privileged changes", () => {
    assert.equal(AUDIT_ACTIONS.login, "login");
    assert.equal(AUDIT_ACTIONS.settlementPut, "settlement_put");
    assert.equal(AUDIT_ACTIONS.matchingModePut, "matching_mode_put");
    assert.equal(AUDIT_ACTIONS.orgUserInvite, "org_user_invite");
  });
});
