import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("invite link normalization (web)", () => {
  it("exports resolveInviteLink and normalizeInviteUrl", () => {
    const mod = readFileSync(join(root, "src/shared/inviteLinks.ts"), "utf8");
    assert.match(mod, /export function normalizeInviteUrl/);
    assert.match(mod, /export function resolveInviteLink/);
    assert.match(mod, /app-cg\.boostbunny\.io/);
    assert.match(mod, /reset-password\?token=/);
  });

  it("InviteCredentialsPanel uses shared resolver", () => {
    const panel = readFileSync(
      join(root, "src/auth/InviteCredentialsPanel.tsx"),
      "utf8",
    );
    assert.match(panel, /from "\.\.\/shared\/inviteLinks"/);
    assert.doesNotMatch(panel, /portalOrigin\(getPortal\(\)\)/);
  });

  it("invite URL field does not break mid-word in CSS", () => {
    const css = readFileSync(join(root, "src/styles/merchant.css"), "utf8");
    const block = css.match(/\.invite-creds__value\s*\{[^}]+\}/)?.[0] ?? "";
    assert.match(block, /white-space:\s*nowrap/);
    assert.doesNotMatch(block, /word-break:\s*break-all/);
  });
});

describe("portal invite links", () => {
  it("redirects legacy /invite to reset-password in SPA", () => {
    const portal = readFileSync(
      join(root, "src/auth/UnauthenticatedPortal.tsx"),
      "utf8",
    );
    assert.match(portal, /InviteLegacyRedirect/);
    assert.match(portal, /path="invite"/);

    const redirect = readFileSync(
      join(root, "src/auth/InviteLegacyRedirect.tsx"),
      "utf8",
    );
    assert.match(redirect, /reset-password/);
  });

  it("nginx redirects /invite on portal hosts", () => {
    const nginx = readFileSync(
      join(root, "../../deploy/nginx-portal-spa.inc"),
      "utf8",
    );
    assert.match(nginx, /location = \/invite/);
    assert.match(nginx, /reset-password/);
  });

  it("membership invite uses subdomain reset-password URLs", () => {
    const routes = readFileSync(
      join(root, "../../apps/api/src/orgs/membership-routes.mjs"),
      "utf8",
    );
    assert.match(routes, /inviteRelativePathForToken/);
    assert.match(routes, /inviteUrlForToken/);
  });

  it("API normalizes legacy invite URLs", () => {
    const links = readFileSync(
      join(root, "../../apps/api/src/mail/portal-links.mjs"),
      "utf8",
    );
    assert.match(links, /export function normalizeInviteUrl/);
    assert.match(links, /LEGACY_APP_HOSTS/);
  });
});
