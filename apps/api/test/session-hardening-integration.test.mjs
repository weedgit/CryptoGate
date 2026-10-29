/**
 * Postgres integration — forced MFA and session lifecycle (H9).
 * Skipped when DATABASE_URL is unset.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/auth/sessions.mjs";
import { createUser } from "../src/auth/users.mjs";
import { encodeBase32, hotp } from "../src/auth/totp.mjs";
import { getPool } from "../src/db/pool.mjs";
import { insertMembership } from "../src/orgs/membership-store.mjs";
import {
  apiFetch,
  enrollTestMfa,
  ensureV032Seed,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;
const PASSWORD = "SessionHarden12345!";

describePg("forced MFA and session lifecycle (H9)", () => {
  /** @type {import("node:http").Server} */
  let server;
  /** @type {string} */
  let base;
  /** @type {Awaited<ReturnType<typeof ensureV032Seed>>} */
  let seed;

  /** @param {string} tag */
  async function merchantOwner(tag) {
    const user = await createUser({
      email: `h9-${tag}-${Date.now()}@paymentgate.local`,
      password: PASSWORD,
    });
    await insertMembership({ orgId: seed.merchantOrgId, userId: user.id, role: "owner" });
    return user;
  }

  /** @param {string} email */
  async function login(email) {
    const res = await fetch(`${base}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    const token = /cg_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1];
    return { status: res.status, json: await res.json(), token };
  }

  before(async () => {
    runMigrations();
    seed = await ensureV032Seed();
    ({ server, base } = await startTestServer());
  });

  after(async () => {
    await stopTestServer(server);
  });

  it("an unenrolled merchant Owner can only read the session and enroll", async () => {
    const owner = await merchantOwner("unenrolled");
    const token = (await createSession({ userId: owner.id, mfaVerified: true })).token;
    const orgs = await apiFetch(base, "/v1/orgs", { token });
    assert.equal(orgs.status, 403);
    assert.equal(orgs.json.code, "mfa_enrollment_required");
    assert.equal((await apiFetch(base, "/v1/auth/session", { token })).status, 200);
    const enroll = await apiFetch(base, "/v1/auth/mfa/enroll", { method: "POST", token, body: {} });
    assert.equal(enroll.status, 200, JSON.stringify(enroll.json));
  });

  it("a password-only session cannot change the password, profile or POS PIN", async () => {
    const owner = await merchantOwner("pre-mfa");
    await enrollTestMfa(owner.id);
    const signedIn = await login(owner.email);
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.json.mfaRequired, true);
    assert.deepEqual(signedIn.json.session.memberships, [], "no memberships before TOTP");
    const token = signedIn.token;
    const change = await apiFetch(base, "/v1/auth/change-password", {
      method: "POST",
      token,
      body: { currentPassword: PASSWORD, newPassword: "Hijacked12345!x" },
    });
    assert.equal(change.status, 401);
    assert.equal(change.json.code, "mfa_required");
    const pin = await apiFetch(base, "/v1/auth/pos-pin", { method: "PUT", token, body: { pin: "123456" } });
    assert.equal(pin.status, 401);
    const profile = await apiFetch(base, "/v1/auth/profile", {
      method: "PATCH",
      token,
      body: { firstName: "Mallory" },
    });
    assert.equal(profile.status, 401);
  });

  it("passing MFA rotates the session token", async () => {
    const owner = await merchantOwner("rotate");
    const secret = Buffer.from("12345678901234567890");
    await getPool().query(
      `UPDATE users SET mfa_secret = $2, mfa_enrolled_at = now() WHERE id = $1`,
      [owner.id, encodeBase32(secret)],
    );
    const signedIn = await login(owner.email);
    const res = await fetch(`${base}/v1/auth/mfa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `cg_session=${signedIn.token}` },
      body: JSON.stringify({ code: hotp(secret, Math.floor(Date.now() / 30_000)) }),
    });
    assert.equal(res.status, 200);
    const rotated = /cg_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1];
    assert.ok(rotated && rotated !== signedIn.token);
    assert.equal((await apiFetch(base, "/v1/auth/session", { token: signedIn.token })).status, 401);
    assert.equal((await apiFetch(base, "/v1/auth/session", { token: rotated })).status, 200);
  });

  it("changing the password signs out the user's other sessions", async () => {
    const owner = await merchantOwner("change");
    await enrollTestMfa(owner.id);
    const current = (await createSession({ userId: owner.id, mfaVerified: true })).token;
    const other = (await createSession({ userId: owner.id, mfaVerified: true })).token;
    const change = await apiFetch(base, "/v1/auth/change-password", {
      method: "POST",
      token: current,
      body: { currentPassword: PASSWORD, newPassword: "ChangedPass12345!" },
    });
    assert.equal(change.status, 200, JSON.stringify(change.json));
    assert.equal((await apiFetch(base, "/v1/auth/session", { token: current })).status, 200);
    assert.equal((await apiFetch(base, "/v1/auth/session", { token: other })).status, 401);
  });

  it("sessions end at the absolute lifetime even while active", async () => {
    const owner = await merchantOwner("absolute");
    await enrollTestMfa(owner.id);
    const { token, sessionId } = await createSession({ userId: owner.id, mfaVerified: true });
    assert.equal((await apiFetch(base, "/v1/auth/session", { token })).status, 200);
    await getPool().query(
      `UPDATE sessions SET created_at = now() - interval '25 hours' WHERE id = $1`,
      [sessionId],
    );
    assert.equal((await apiFetch(base, "/v1/auth/session", { token })).status, 401);
  });
});

describePg("login email change needs the password (M18)", () => {
  it("refuses an email change without the current password", async () => {
    const { server, base } = await startTestServer();
    try {
      const seed = await ensureV032Seed();
      const user = await createUser({
        email: `m18-${Date.now()}@paymentgate.local`,
        password: PASSWORD,
      });
      await insertMembership({ orgId: seed.merchantOrgId, userId: user.id, role: "viewer" });
      const token = (await createSession({ userId: user.id, mfaVerified: true })).token;
      const next = `m18-new-${Date.now()}@paymentgate.local`;
      const missing = await apiFetch(base, "/v1/auth/contact/email/send", {
        method: "POST",
        token,
        body: { email: next },
      });
      assert.equal(missing.status, 400);
      assert.equal(missing.json.code, "password_required");
      const wrong = await apiFetch(base, "/v1/auth/contact/email/send", {
        method: "POST",
        token,
        body: { email: next, currentPassword: "WrongPassword123!" },
      });
      assert.equal(wrong.status, 401);
      const ok = await apiFetch(base, "/v1/auth/contact/email/send", {
        method: "POST",
        token,
        body: { email: next, currentPassword: PASSWORD },
      });
      assert.equal(ok.status, 200, JSON.stringify(ok.json));
    } finally {
      await stopTestServer(server);
    }
  });
});

