import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { validatePasswordReset } from "../src/auth/password-policy.mjs";
import {
  invitePathForToken,
  inviteRelativePathForToken,
  inviteUrlForToken,
  normalizeInviteUrl,
  normalizePortalOrigin,
  passwordResetUrl,
  portalLoginUrl,
  portalSlugForOrgType,
  portalWebUrl,
} from "../src/mail/portal-links.mjs";

describe("temporary invite password", () => {
  /** Same pattern as provisionUserForInvite in membership-store.mjs */
  function sampleTemporaryPassword() {
    return `${randomBytes(12).toString("base64url")}9aA!`;
  }

  it("meets reset password policy", () => {
    for (let i = 0; i < 5; i += 1) {
      const pw = sampleTemporaryPassword();
      const r = validatePasswordReset(pw);
      assert.equal(r.ok, true, JSON.stringify(r));
    }
  });
});

describe("portal invite links", () => {
  const prev = {
    platform: process.env.PLATFORM_WEB_ORIGIN,
    agent: process.env.AGENT_WEB_ORIGIN,
    merchant: process.env.MERCHANT_WEB_ORIGIN,
  };

  it("maps org types to portal slugs", () => {
    assert.equal(portalSlugForOrgType("platform"), "platform");
    assert.equal(portalSlugForOrgType("agent_sub"), "agent");
    assert.equal(portalSlugForOrgType("merchant_site"), "merchant");
  });

  it("builds subdomain invite and reset URLs", () => {
    process.env.PLATFORM_WEB_ORIGIN = "https://platform-cg.example.test";
    process.env.AGENT_WEB_ORIGIN = "https://agent-cg.example.test";
    process.env.MERCHANT_WEB_ORIGIN = "https://merchant-cg.example.test";

    assert.equal(inviteRelativePathForToken("tok"), "/reset-password?token=tok");
    assert.equal(
      inviteUrlForToken("agent", "tok"),
      "https://agent-cg.example.test/reset-password?token=tok",
    );
    assert.equal(invitePathForToken("agent", "tok"), "/reset-password?token=tok");
    assert.equal(
      passwordResetUrl("reset-tok"),
      "https://merchant-cg.example.test/reset-password?token=reset-tok",
    );
    assert.equal(
      portalLoginUrl("agent"),
      "https://agent-cg.example.test",
    );
    assert.equal(
      portalWebUrl("platform", "/settings/team"),
      "https://platform-cg.example.test/settings/team",
    );

    if (prev.platform === undefined) delete process.env.PLATFORM_WEB_ORIGIN;
    else process.env.PLATFORM_WEB_ORIGIN = prev.platform;
    if (prev.agent === undefined) delete process.env.AGENT_WEB_ORIGIN;
    else process.env.AGENT_WEB_ORIGIN = prev.agent;
    if (prev.merchant === undefined) delete process.env.MERCHANT_WEB_ORIGIN;
    else process.env.MERCHANT_WEB_ORIGIN = prev.merchant;
  });

  it("normalizes path-prefixed portal origins", () => {
    assert.equal(
      normalizePortalOrigin("http://localhost:5174/agent", "agent"),
      "http://localhost:5174",
    );
    assert.equal(
      normalizePortalOrigin("https://platform-cg.example.test/platform", "platform"),
      "https://platform-cg.example.test",
    );
  });

  it("rewrites invite URLs with stray whitespace", () => {
    assert.equal(
      normalizeInviteUrl(
        "https://platform-cg.boostbunny.io /reset-password?token=abc123",
        "platform",
      ),
      "https://platform-cg.boostbunny.io/reset-password?token=abc123",
    );
    assert.equal(
      normalizeInviteUrl(
        "https://agent-cg.boostbunny.io/reset-password?token=abc123",
        "agent",
      ),
      "https://agent-cg.boostbunny.io/reset-password?token=abc123",
    );
  });
});
