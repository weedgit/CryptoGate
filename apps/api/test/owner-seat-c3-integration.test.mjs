/**
 * Postgres integration — C3 (review 2026-10-29): a Platform Administrator must not be able to
 * seat themselves or anyone else as an Owner, take over an Owner's sign-in, or force a
 * merchant settlement address. Skipped when DATABASE_URL is unset.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/auth/sessions.mjs";
import { createUser } from "../src/auth/users.mjs";
import { insertMembership } from "../src/orgs/membership-store.mjs";
import {
  enrollTestMfa,
  apiFetch,
  ensureV032Seed,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

describePg("owner seats are Owner / Platform Owner only (C3)", () => {
  /** @type {import("node:http").Server} */
  let server;
  /** @type {string} */
  let base;
  /** @type {Awaited<ReturnType<typeof ensureV032Seed>>} */
  let seed;
  /** @type {string} */
  let adminId;
  /** @type {string} */
  let adminToken;
  /** @type {string} */
  let viewerId;

  before(async () => {
    runMigrations();
    seed = await ensureV032Seed();
    ({ server, base } = await startTestServer());
    const stamp = Date.now();
    const admin = await createUser({
      email: `c3-admin-${stamp}@paymentgate.local`,
      password: "C3AdminPass12345!",
    });
    adminId = admin.id;
    await insertMembership({ orgId: seed.platformOrgId, userId: admin.id, role: "administrator" });
    await enrollTestMfa(admin.id);
    adminToken = (await createSession({ userId: admin.id, mfaVerified: true })).token;
    const viewer = await createUser({
      email: `c3-viewer-${stamp}@paymentgate.local`,
      password: "C3ViewerPass12345!",
    });
    viewerId = viewer.id;
    await insertMembership({ orgId: seed.merchantOrgId, userId: viewer.id, role: "viewer" });
    await enrollTestMfa(viewer.id);
  });

  after(async () => {
    await stopTestServer(server);
  });

  it("Platform Admin cannot promote themselves to Platform Owner", async () => {
    const res = await apiFetch(base, `/v1/orgs/${seed.platformOrgId}/users/${adminId}/role`, {
      method: "PUT",
      token: adminToken,
      body: { role: "owner" },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, "cannot_change_own_role");

    const patch = await apiFetch(base, `/v1/orgs/${seed.platformOrgId}/members/${adminId}`, {
      method: "PATCH",
      token: adminToken,
      body: { role: "owner" },
    });
    assert.equal(patch.status, 403);
    assert.equal(patch.json.code, "cannot_change_own_role");
  });

  it("Platform Admin cannot seat an Owner on an org that already has members", async () => {
    const invite = await apiFetch(base, `/v1/orgs/${seed.merchantOrgId}/users`, {
      method: "POST",
      token: adminToken,
      body: { email: `c3-new-owner-${Date.now()}@paymentgate.local`, role: "owner" },
    });
    assert.equal(invite.status, 403);
    assert.equal(invite.json.code, "owner_seat_forbidden");

    const promote = await apiFetch(base, `/v1/orgs/${seed.merchantOrgId}/users/${viewerId}/role`, {
      method: "PUT",
      token: adminToken,
      body: { role: "owner" },
    });
    assert.equal(promote.status, 403);
    assert.equal(promote.json.code, "owner_seat_forbidden");

    const demoteOwner = await apiFetch(
      base,
      `/v1/orgs/${seed.platformOrgId}/users/${seed.platformUserId}/role`,
      { method: "PUT", token: adminToken, body: { role: "viewer" } },
    );
    assert.equal(demoteOwner.status, 403);

    const removeOwner = await apiFetch(
      base,
      `/v1/orgs/${seed.platformOrgId}/users/${seed.platformUserId}`,
      { method: "DELETE", token: adminToken },
    );
    assert.equal(removeOwner.status, 403);
    assert.equal(removeOwner.json.code, "owner_seat_forbidden");
  });

  it("Platform Admin still manages non-owner roles", async () => {
    const res = await apiFetch(base, `/v1/orgs/${seed.merchantOrgId}/users/${viewerId}/role`, {
      method: "PUT",
      token: adminToken,
      body: { role: "administrator" },
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
  });

  it("Platform Admin cannot reset the Platform Owner's password or email", async () => {
    const res = await apiFetch(
      base,
      `/v1/orgs/${seed.platformOrgId}/members/${seed.platformUserId}`,
      { method: "PATCH", token: adminToken, body: { password: "TakenOver12345!" } },
    );
    assert.equal(res.status, 403);
    const email = await apiFetch(
      base,
      `/v1/orgs/${seed.platformOrgId}/members/${seed.platformUserId}`,
      { method: "PATCH", token: adminToken, body: { email: "attacker@example.com" } },
    );
    assert.equal(email.status, 403);
  });

  it("Platform Admin cannot force a merchant settlement address", async () => {
    const res = await apiFetch(
      base,
      `/v1/platform/orgs/${seed.merchantOrgId}/compliance-override`,
      {
        method: "POST",
        token: adminToken,
        body: {
          overrideType: "settlement_address",
          reasonCode: "manual_review",
          notes: "redirect funds please",
          mfaCode: "123456",
          settlement: { network: "tron", address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" },
        },
      },
    );
    assert.equal(res.status, 403);
    assert.match(res.json.message, /Platform Owner/);
  });

  it("Platform Owner can still seat a merchant Owner", async () => {
    const res = await apiFetch(base, `/v1/orgs/${seed.merchantOrgId}/users/${viewerId}/role`, {
      method: "PUT",
      token: seed.platformToken,
      body: { role: "owner" },
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
  });
});
