/**
 * Postgres integration — platform-wide email uniqueness on org invite.
 * Skipped when DATABASE_URL is unset.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/auth/sessions.mjs";
import { createUser } from "../src/auth/users.mjs";
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
    assert.match(res.json.message, /already registered on the platform/i);
  });

  it("allows invite when email is new", async () => {
    const freshEmail = `email-fresh-${Date.now()}@paymentgate.local`;
    const res = await apiFetch(base, `/v1/orgs/${seed.platformOrgId}/users`, {
      method: "POST",
      token: seed.platformToken,
      body: { email: freshEmail, role: "viewer" },
    });

    assert.equal(res.status, 201);
    assert.equal(res.json.email, freshEmail);
    assert.equal(res.json.role, "viewer");
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
      structure: null,
      maxAgentDepth: 2,
    });
    assert.equal(agent.ok, true);

    await insertMembership({
      orgId: agent.row.id,
      userId: agentOwner.id,
      role: "owner",
    });

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
