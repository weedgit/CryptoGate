import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("portal session auth", () => {
  it("wraps API calls and registers global 401 handlers", () => {
    const fetchMod = readFileSync(
      join(root, "src/auth/apiFetch.ts"),
      "utf8",
    );
    assert.match(fetchMod, /unauthenticated/);
    assert.match(fetchMod, /mfa_required/);
    assert.match(fetchMod, /registerSessionAuthHandlers/);
    assert.match(fetchMod, /setSessionAuthActive/);

    const boot = readFileSync(join(root, "src/auth/usePortalBoot.ts"), "utf8");
    assert.match(boot, /registerSessionAuthHandlers/);
    assert.match(boot, /setSessionAuthActive/);

    const merchantApi = readFileSync(
      join(root, "src/merchant/api.ts"),
      "utf8",
    );
    assert.match(merchantApi, /apiFetch/);
    assert.doesNotMatch(merchantApi, /await fetch\(/);

    const login = readFileSync(
      join(root, "src/auth/PortalLoginPage.tsx"),
      "utf8",
    );
    assert.match(login, /consumeSessionNotice/);
  });
});

describe("session TTL defaults", () => {
  it("defaults new users to 120 minutes", async () => {
    const { normalizeSessionTimeoutMinutes, DEFAULT_USER_SESSION_TIMEOUT_MINUTES } =
      await import("../../api/src/http/session-ttl.mjs");
    assert.equal(DEFAULT_USER_SESSION_TIMEOUT_MINUTES, 120);
    assert.equal(normalizeSessionTimeoutMinutes(undefined), 120);
    assert.equal(normalizeSessionTimeoutMinutes(null), 120);
    assert.equal(normalizeSessionTimeoutMinutes(30), 30);
  });

  it("touches session on requireSession", () => {
    const requireSession = readFileSync(
      join(root, "../../apps/api/src/http/require-session.mjs"),
      "utf8",
    );
    assert.match(requireSession, /touchSessionFromCookie/);
  });
});
