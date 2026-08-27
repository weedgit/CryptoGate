import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateTemporaryPassword } from "../src/auth/temp-password.mjs";
import { validatePasswordReset } from "../src/auth/password-policy.mjs";
import {
  invitePathForToken,
  inviteUrlForToken,
  portalSlugForOrgType,
} from "../src/mail/portal-links.mjs";

describe("temporary invite password", () => {
  it("meets reset password policy", () => {
    for (let i = 0; i < 5; i += 1) {
      const pw = generateTemporaryPassword();
      const r = validatePasswordReset(pw);
      assert.equal(r.ok, true, JSON.stringify(r));
    }
  });
});

describe("portal invite links", () => {
  it("maps org types to portal slugs", () => {
    assert.equal(portalSlugForOrgType("platform"), "platform");
    assert.equal(portalSlugForOrgType("agent_sub"), "agent");
    assert.equal(portalSlugForOrgType("merchant_site"), "merchant");
  });

  it("builds invite paths", () => {
    const path = invitePathForToken("merchant", "tok");
    assert.match(path, /^\/merchant\/reset-password\?token=/);
    assert.ok(inviteUrlForToken("merchant", "tok").includes(path));
  });
});
