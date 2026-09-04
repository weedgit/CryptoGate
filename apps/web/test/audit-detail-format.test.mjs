import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  auditResourceLabel,
  summarizeAuditMetadata,
} from "../src/shared/auditDetailFormat.ts";

describe("audit detail formatting", () => {
  it("summarizes team invite with email and role", () => {
    const detail = summarizeAuditMetadata("org_user_invite", {
      email: "admin@example.com",
      role: "administrator",
      provisioned: true,
      invitedUserId: "f1183de1-1a6a-4b3f-9155-a05e7aa76ebe",
    });
    assert.match(detail.headline, /admin@example\.com/);
    assert.match(detail.headline, /Administrator/);
    assert.ok(detail.lines.some((l) => /New login created/.test(l)));
    assert.ok(!detail.headline.includes("f1183de1"));
  });

  it("shows initial sign-in on agent invite audit rows", () => {
    const detail = summarizeAuditMetadata("org_user_invite", {
      email: "owner@agent.io",
      role: "owner",
      provisioned: true,
      orgType: "agent",
      initialSignIn: "one-time-pass-9aA!",
    });
    assert.ok(
      detail.lines.some((l) =>
        /Initial sign-in \(audit recovery\): one-time-pass-9aA!/.test(l),
      ),
    );
  });

  it("prefers display name over email", () => {
    const detail = summarizeAuditMetadata("org_user_invite", {
      email: "admin@example.com",
      displayName: "Alex Admin",
      role: "administrator",
      provisioned: false,
      invitedUserId: "f1183de1-1a6a-4b3f-9155-a05e7aa76ebe",
    });
    assert.match(detail.headline, /Alex Admin/);
    assert.doesNotMatch(detail.headline, /admin@example\.com/);
  });

  it("uses team member label when identity missing", () => {
    const detail = summarizeAuditMetadata("org_user_invite", {
      role: "administrator",
      provisioned: false,
      invitedUserId: "f1183de1-1a6a-4b3f-9155-a05e7aa76ebe",
    });
    assert.match(detail.headline, /Invited Team member as Administrator/);
    assert.ok(!detail.lines.some((l) => /User ID/.test(l)));
  });

  it("prefers display name or email in resource column", () => {
    assert.equal(
      auditResourceLabel({ email: "finance@merchant.io", invitedUserId: "x" }),
      "finance@merchant.io",
    );
    assert.equal(
      auditResourceLabel({
        displayName: "Finance Desk",
        invitedUserId: "x",
      }),
      "Finance Desk",
    );
    assert.equal(auditResourceLabel({ invitedUserId: "x" }), "—");
  });
});
