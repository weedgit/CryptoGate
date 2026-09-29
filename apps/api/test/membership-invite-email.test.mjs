/**
 * Postgres integration — platform-wide email uniqueness on org invite.
 * Skipped when DATABASE_URL is unset.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/auth/sessions.mjs";
import { createUser } from "../src/auth/users.mjs";
import { getPool } from "../src/db/pool.mjs";
import { insertMembership } from "../src/orgs/membership-store.mjs";
import { insertOrgAccount } from "../src/orgs/org-store.mjs";
import {
  apiFetch,
  ensureV032Seed,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

describePg("org invite — platform-wide email uniqueness", () => {
  /** @type {import("node:http").Server} */
  let server;
  /** @type {string} */
  let base;
  /** @type {Awaited<ReturnType<typeof ensureV032Seed>>} */
  let seed;

  before(async () => {
    runMigrations();
    seed = await ensureV032Seed();
    ({ server, base } = await startTestServer());
  });

  after(async () => {
    await stopTestServer(server);
  });

  it("rejects invite when email already belongs to another org", async () => {
    const takenEmail = `email-uniq-${Date.now()}@paymentgate.local`;
    const existingUser = await createUser({
      email: takenEmail,
      password: "UniqueTestPass12!",
    });
    await insertMembership({
      orgId: seed.merchantOrgId,
      userId: existingUser.id,
      role: "viewer",
    });

    const res = await apiFetch(base, `/v1/orgs/${seed.platformOrgId}/users`, {
      method: "POST",
      token: seed.platformToken,
      body: { email: takenEmail, role: "viewer" },
    });

    assert.equal(res.status, 409);
    assert.equal(res.json.code, "email_taken");
    assert.match(res.json.message, /already registered/i);
  });

  it("rejects a registered email even on a merchant team (no cross-org exception)", async () => {
    const takenEmail = `email-cross-${Date.now()}@paymentgate.local`;
    const operator = await createUser({ email: takenEmail, password: "UniqueTestPass12!" });
    await insertMembership({ orgId: seed.platformOrgId, userId: operator.id, role: "administrator" });

    const res = await apiFetch(base, `/v1/orgs/${seed.merchantOrgId}/users`, {
      method: "POST",
      token: seed.platformToken,
      body: { email: takenEmail, role: "administrator" },
    });
    assert.equal(res.status, 409);
    assert.equal(res.json.code, "email_taken");
  });

  it("removing a member deletes the account and frees the email for a fresh invite", async () => {
    const email = `email-reuse-${Date.now()}@paymentgate.local`;
    const first = await apiFetch(base, `/v1/orgs/${seed.merchantOrgId}/users`, {
      method: "POST",
      token: seed.platformToken,
      body: { email, role: "viewer" },
    });
    assert.equal(first.status, 201);

    const removed = await apiFetch(
      base,
      `/v1/orgs/${seed.merchantOrgId}/users/${first.json.userId}`,
      { method: "DELETE", token: seed.platformToken },
    );
    assert.equal(removed.status, 204);
    const { rows } = await getPool().query(
      `SELECT email, deleted_at FROM users WHERE id = $1`,
      [first.json.userId],
    );
    assert.ok(rows[0].deleted_at);
    assert.notEqual(rows[0].email, email);

    const again = await apiFetch(base, `/v1/orgs/${seed.merchantOrgId}/users`, {
      method: "POST",
      token: seed.platformToken,
      body: { email, role: "viewer" },
    });
    assert.equal(again.status, 201);
    assert.notEqual(again.json.userId, first.json.userId);
    assert.ok(again.json.temporaryPassword);
  });

  it("allows invite when email is new", async () => {
    const freshEmail = `email-fresh-${Date.now()}@paymentgate.local`;
    const res = await apiFetch(base, `/v1/orgs/${seed.platformOrgId}/users`, {
      method: "POST",
      token: seed.platformToken,
      body: { email: freshEmail, role: "viewer" },
    });

    assert.equal(res.status, 201);
    assert.equal(res.json.orgId, seed.platformOrgId);
    assert.ok(res.json.userId);
    assert.equal(res.json.role, "viewer");
  });

  it("stores initialSignIn on agent owner invite audit for platform recovery", async () => {
    const agent = await insertOrgAccount({
      type: "agent",
      name: `Audit recovery agent ${Date.now()}`,
      parentId: seed.platformOrgId,
      maxAgentDepth: null,
    });
    assert.equal(agent.ok, true);

    const ownerEmail = `agent-audit-${Date.now()}@paymentgate.local`;
    const invite = await apiFetch(base, `/v1/orgs/${agent.row.id}/users`, {
      method: "POST",
      token: seed.platformToken,
      body: { email: ownerEmail, role: "owner" },
    });
    assert.equal(invite.status, 201);
    assert.ok(invite.json.temporaryPassword);

    const audit = await apiFetch(
      base,
      `/v1/audit?orgId=${encodeURIComponent(agent.row.id)}&action=org_user_invite&limit=5`,
      { token: seed.platformToken },
    );
    assert.equal(audit.status, 200);
    const row = audit.json.items.find(
      (item) =>
        item.action === "org_user_invite" &&
        item.metadata?.email === ownerEmail,
    );
    assert.ok(row, "expected org_user_invite audit row");
    assert.equal(row.metadata.initialSignIn, invite.json.temporaryPassword);
    assert.equal(row.metadata.orgType, "agent");
  });

  it("allows same email on the same org only once", async () => {
    const agentOwnerEmail = `agent-owner-${Date.now()}@paymentgate.local`;
    const agentOwner = await createUser({
      email: agentOwnerEmail,
      password: "UniqueTestPass12!",
    });

    const agent = await insertOrgAccount({
      type: "agent",
      name: `Email uniq agent ${Date.now()}`,
      parentId: seed.platformOrgId,
      maxAgentDepth: null,
    });
    assert.equal(agent.ok, true);

    await insertMembership({
      orgId: agent.row.id,
      userId: agentOwner.id,
      role: "owner",
    });
    const pool = getPool();
    await pool.query(
      `UPDATE users SET first_name = 'Agent', last_name = 'Owner', timezone = 'UTC' WHERE id = $1`,
      [agentOwner.id],
    );
    await pool.query(`UPDATE org_accounts SET billing_email = $2 WHERE id = $1`, [
      agent.row.id,
      agentOwnerEmail,
    ]);
    await pool.query(
      `INSERT INTO agent_payout_addresses (org_id, asset, network, address)
       VALUES ($1, 'USDT', 'tron', 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf')`,
      [agent.row.id],
    );

    const agentSession = await createSession({
      userId: agentOwner.id,
      mfaVerified: true,
    });

    const first = await apiFetch(base, `/v1/orgs/${agent.row.id}/users`, {
      method: "POST",
      token: agentSession.token,
      body: { email: agentOwnerEmail, role: "administrator" },
    });
    assert.equal(first.status, 400);
    assert.equal(first.json.code, "membership_exists");
  });
});
